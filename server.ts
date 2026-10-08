import express from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
const SECRET = process.env.JWT_SECRET || (isProd ? '' : 'dev-secret');
const ADMINS = (process.env.ADMIN_PHONES || '').split(',').map(phone => phone.trim()).filter(Boolean);
const OTP_DEMO = process.env.OTP_DEMO === 'true' || (!isProd && process.env.OTP_DEMO !== 'false');
const smsConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  from: process.env.TWILIO_FROM,
};
const smsConfigured = Boolean(smsConfig.accountSid && smsConfig.authToken && smsConfig.from);
const allowedOrigins = new Set((process.env.CORS_ORIGIN || '').split(',').map(origin => origin.trim()).filter(Boolean));

if (isProd) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in production; local file storage is not production-safe.');
  if (Buffer.byteLength(SECRET, 'utf8') < 32) throw new Error('Set JWT_SECRET to a random value of at least 32 bytes in production.');
  if (OTP_DEMO) throw new Error('OTP_DEMO must not be enabled in production.');
  if (Object.values(smsConfig).some(Boolean) && !smsConfigured) throw new Error('Set all of TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM to enable SMS.');
}

app.use(express.json({ limit: '1mb' }));
app.use('/api', (req, res, next) => {
  const origin = req.get('Origin');
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && !allowedOrigins.has(origin) ? 403 : 204);
  next();
});

// ---- Rate limit (per IP, 120 req/min) ----
const hits = new Map<string, { n: number; t: number }>();
app.use('/api', (req, res, next) => {
  const k = req.ip || 'x', now = Date.now(), h = hits.get(k);
  if (!h || now - h.t > 60000) hits.set(k, { n: 1, t: now }); else if (++h.n > 120) return res.status(429).json({ error: 'Too many requests' });
  next();
});

// ---- Storage: PostgreSQL if DATABASE_URL is set, else a local JSON file (data.json) ----
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
const FILE = path.resolve('data.json');
const mem: Record<string, Record<string, any>> = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => { if (!pool) fs.writeFileSync(FILE, JSON.stringify(mem)); };
const all = async (kind: string): Promise<any[]> => pool ? (await pool.query('SELECT data FROM docs WHERE kind=$1', [kind])).rows.map(r => r.data) : Object.values(mem[kind] || {});
const get = async (kind: string, id: string) => pool ? (await pool.query('SELECT data FROM docs WHERE kind=$1 AND id=$2', [kind, id])).rows[0]?.data : mem[kind]?.[id];
const put = async (kind: string, o: any) => {
  if (pool) await pool.query('INSERT INTO docs(kind,id,data) VALUES($1,$2,$3) ON CONFLICT(kind,id) DO UPDATE SET data=$3', [kind, o.id, o]);
  else { (mem[kind] ||= {})[o.id] = o; save(); }
};
const uid = () => crypto.randomBytes(6).toString('hex');

// ---- Auth: phone OTP + signed token ----
const sign = (phone: string) => { const b = Buffer.from(JSON.stringify({ phone, exp: Date.now() + 30 * 864e5 })).toString('base64url'); return b + '.' + crypto.createHmac('sha256', SECRET).update(b).digest('base64url'); };
const auth = (req: any, res: any, next: any) => {
  const authorization = String(req.headers.authorization || '');
  const match = /^Bearer ([^.]+)\.([^.]+)$/.exec(authorization);
  if (!match) return res.status(401).json({ error: 'Please log in' });
  const [, b, sig] = match;
  const expected = crypto.createHmac('sha256', SECRET).update(b).digest();
  let actual: Buffer;
  try { actual = Buffer.from(sig, 'base64url'); } catch { return res.status(401).json({ error: 'Please log in' }); }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return res.status(401).json({ error: 'Please log in' });
  let d: { phone?: string; exp?: number };
  try { d = JSON.parse(Buffer.from(b, 'base64url').toString()); } catch { return res.status(401).json({ error: 'Please log in' }); }
  if (!Number.isFinite(d.exp) || (d.exp as number) < Date.now()) return res.status(401).json({ error: 'Session expired' });
  if (typeof d.phone !== 'string' || !okPhone(d.phone)) return res.status(401).json({ error: 'Please log in' });
  req.phone = d.phone; req.isAdmin = ADMINS.includes(d.phone); next();
};
const admin = (req: any, res: any, next: any) => req.isAdmin ? next() : res.status(403).json({ error: 'Admins only' });
const otps = new Map<string, { code: string; exp: number; tries: number }>();
const otpRequests = new Map<string, { count: number; windowStart: number; lastSent: number }>();
const okPhone = (p: string) => /^03\d{9}$/.test(p);

app.post('/api/auth/otp', async (req, res) => {
  if (!OTP_DEMO && !smsConfigured) return res.status(503).json({ error: 'Phone verification is not configured yet.' });
  const phone = String(req.body?.phone || '');
  if (!okPhone(phone)) return res.status(400).json({ error: 'Enter a valid number like 03XXXXXXXXX' });
  const now = Date.now();
  const previous = otpRequests.get(phone);
  if (previous && now - previous.lastSent < 60000) {
    res.setHeader('Retry-After', String(Math.ceil((60000 - (now - previous.lastSent)) / 1000)));
    return res.status(429).json({ error: 'Please wait before requesting another code.' });
  }
  const window = previous && now - previous.windowStart < 3600000
    ? previous
    : { count: 0, windowStart: now, lastSent: 0 };
  if (window.count >= 5) return res.status(429).json({ error: 'Too many codes requested. Try again in an hour.' });
  const code = String(crypto.randomInt(100000, 1000000));
  if (!OTP_DEMO) {
    try {
      const credentials = Buffer.from(`${smsConfig.accountSid}:${smsConfig.authToken}`).toString('base64');
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(smsConfig.accountSid!)}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: `+92${phone.slice(1)}`, From: smsConfig.from!, Body: `Your CarBazar.pk verification code is ${code}. It expires in 5 minutes.` }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        console.error(`OTP SMS provider returned HTTP ${response.status}.`);
        return res.status(502).json({ error: 'Could not send verification code. Please try again later.' });
      }
    } catch (error) {
      console.error('OTP SMS delivery failed:', error);
      return res.status(502).json({ error: 'Could not send verification code. Please try again later.' });
    }
  }
  otpRequests.set(phone, { count: window.count + 1, windowStart: window.windowStart, lastSent: now });
  otps.set(phone, { code, exp: Date.now() + 5 * 60000, tries: 0 });
  if (OTP_DEMO) console.info(`Demo OTP requested for ${phone}.`);
  res.json({ sent: true, ...(OTP_DEMO ? { demoCode: code } : {}) });
});
app.post('/api/auth/verify', (req, res) => {
  const { phone, code } = req.body || {}, o = otps.get(phone);
  if (!o || o.exp < Date.now() || ++o.tries > 5 || o.code !== String(code)) return res.status(400).json({ error: 'Invalid or expired code' });
  otps.delete(phone);
  res.json({ token: sign(phone), phone, isAdmin: ADMINS.includes(phone) });
});

// ---- Listings ----
app.get('/api/listings', async (req, res) => {
  const { q = '', city = '', make = '', transmission = '', sort = 'new' } = req.query as Record<string, string>;
  const min = Number(req.query.minPrice) || 0, max = Number(req.query.maxPrice) || Infinity, yr = Number(req.query.year) || 0;
  let rows = (await all('listing')).filter(l => l.status === 'approved' && (!q || l.title.toLowerCase().includes(q.toLowerCase())) && (!city || l.city === city) && (!make || l.make === make) && (!transmission || l.transmission === transmission) && l.price >= min && l.price <= max && l.year >= yr);
  rows.sort((a, b) => sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : b.createdAt - a.createdAt);
  res.json(rows);
});
app.get('/api/my/listings', auth, async (req: any, res) => res.json((await all('listing')).filter(l => l.seller === req.phone && l.status !== 'removed')));
app.post('/api/listings', auth, async (req: any, res) => {
  const b = req.body || {};
  if (!b.title || !b.price || !b.city || !b.year) return res.status(400).json({ error: 'title, price, city and year are required' });
  const l = { id: 'L' + uid(), title: String(b.title).slice(0, 120), make: String(b.make || '').slice(0, 40), model: String(b.model || ''), year: Number(b.year), price: Number(b.price), mileage: Number(b.mileage || 0), city: String(b.city), transmission: String(b.transmission || 'Manual'), fuel_type: String(b.fuel_type || 'Petrol'), seller: req.phone, status: req.isAdmin ? 'approved' : 'pending', createdAt: Date.now() };
  await put('listing', l); res.status(201).json(l);
});
app.post('/api/offers', auth, async (req: any, res) => {
  const { listingId, amount, message } = req.body || {};
  if (!(await get('listing', listingId)) || !amount) return res.status(400).json({ error: 'Valid listingId and amount required' });
  const o = { id: 'O' + uid(), listingId, from: req.phone, amount: Number(amount), message: String(message || ''), at: Date.now() };
  await put('offer', o); res.status(201).json(o);
});
app.get('/api/my/offers', auth, async (req: any, res) => { // offers received on my cars
  const mine = new Set((await all('listing')).filter(l => l.seller === req.phone).map(l => l.id));
  res.json((await all('offer')).filter(o => mine.has(o.listingId)));
});
app.get('/api/contact/:id', auth, async (req, res) => { const l = await get('listing', req.params.id); l ? res.json({ phone: l.seller }) : res.status(404).json({ error: 'Not found' }); });

// ---- Favorites, reports ----
app.get('/api/favorites', auth, async (req: any, res) => res.json((await get('fav', req.phone))?.ids || []));
app.post('/api/favorites/:id', auth, async (req: any, res) => {
  const f = (await get('fav', req.phone)) || { id: req.phone, ids: [] as string[] };
  f.ids = f.ids.includes(req.params.id) ? f.ids.filter((x: string) => x !== req.params.id) : [...f.ids, req.params.id];
  await put('fav', f); res.json(f.ids);
});
app.post('/api/reports', auth, async (req: any, res) => { await put('report', { id: 'R' + uid(), listingId: req.body?.listingId, reason: String(req.body?.reason || '').slice(0, 300), by: req.phone, at: Date.now() }); res.status(201).json({ ok: true }); });

// ---- Admin ----
app.get('/api/admin/queue', auth, admin, async (_req, res) => res.json({ pending: (await all('listing')).filter(l => l.status === 'pending'), reports: await all('report') }));
app.post('/api/admin/listings/:id/:action', auth, admin, async (req, res) => {
  const l = await get('listing', req.params.id); if (!l) return res.status(404).json({ error: 'Not found' });
  l.status = req.params.action === 'approve' ? 'approved' : 'removed'; await put('listing', l); res.json(l);
});

// ---- Payments (manual transfer details) ----
app.get('/api/payments', (_req, res) => res.json({
  easypaisa: '03455033254', jazzcash: '03235407409',
  bank: { name: 'Bank Alfalah', iban: 'PK55ALFH0403001005236351', title: process.env.PAY_ACCOUNT_TITLE || '' },
  note: 'Send payment, then WhatsApp the screenshot with your ad ID to activate your featured ad.',
}));

app.get('/api/trends/:id', async (req, res) => {
  const l = await get('listing', req.params.id); if (!l) return res.status(404).json({ error: 'Not found' });
  const months = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']; // demo curve
  res.json(months.map((m, i) => ({ month: m, price: Math.round(l.price * (1.06 - i * 0.006 + Math.sin(i) * 0.01)) })));
});
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
app.post('/api/ai/describe', auth, async (req, res) => {
  if (!ai) return res.status(503).json({ error: 'Set GEMINI_API_KEY in .env' });
  try { res.json({ text: (await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: `Write a 2-sentence honest used-car ad in Pakistan: ${JSON.stringify(req.body)}` })).text }); }
  catch { res.status(500).json({ error: 'AI request failed' }); }
});

async function start() {
  if (isProd && !pool) throw new Error('PostgreSQL is required in production.');
  if (pool) await pool.query('CREATE TABLE IF NOT EXISTS docs (kind TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL, PRIMARY KEY (kind, id))');
  if (!isProd && !(await all('listing')).length) for (const [i, [title, make, year, price, km, city, tr]] of ([['Toyota Corolla GLi 1.3', 'Toyota', 2018, 4950000, 62000, 'Lahore', 'Manual'], ['Suzuki Alto VXL AGS', 'Suzuki', 2021, 2850000, 28000, 'Karachi', 'Automatic'], ['Honda Civic Oriel 1.8', 'Honda', 2017, 5600000, 81000, 'Islamabad', 'Automatic']] as any[]).entries())
    await put('listing', { id: 'S' + i, title, make, model: '', year, price, mileage: km, city, transmission: tr, fuel_type: 'Petrol', seller: '03000000000', status: 'approved', createdAt: Date.now() - i });
  if (isProd) { const dist = path.resolve('dist'); app.use(express.static(dist)); app.get('*', (_q, r) => r.sendFile(path.join(dist, 'index.html'))); }
  else { const { createServer } = await import('vite'); app.use((await createServer({ server: { middlewareMode: true }, appType: 'spa' })).middlewares); }
  app.listen(PORT, '0.0.0.0', () => console.log(`CarBazar.pk running on http://localhost:${PORT}`));
}
start().catch(error => {
  console.error('Failed to start CarBazar.pk:', error);
  process.exitCode = 1;
});
