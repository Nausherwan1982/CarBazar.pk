import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Search, Plus, MapPin, Gauge, X, Heart, Phone, MessageCircle, Flag } from 'lucide-react';

type L = { id: string; title: string; make: string; year: number; price: number; mileage: number; city: string; transmission: string; fuel_type: string; status?: string; seller?: string };
// Set VITE_API_URL in .env (e.g. https://carbazar.onrender.com) for the Android app; empty = same server
const API = (import.meta.env.VITE_API_URL as string | undefined) || '';
const pkr = (n: number) => 'Rs ' + n.toLocaleString('en-PK');
const T = {
  en: { find: 'Find your next car', search: 'Search make or model', sell: 'Sell your car', none: 'No cars match. Try different filters.' },
  ur: { find: 'اپنی اگلی گاڑی تلاش کریں', search: 'برانڈ یا ماڈل تلاش کریں', sell: 'اپنی گاڑی بیچیں', none: 'کوئی گاڑی نہیں ملی۔' },
};
const CITIES = ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta'];
const MAKES = ['Toyota', 'Suzuki', 'Honda', 'Kia', 'Hyundai', 'Nissan'];
const wa = (p: string, text: string) => `https://wa.me/92${p.replace(/^0/, '')}?text=${encodeURIComponent(text)}`;

function useApi() {
  const [token, setToken] = useState(localStorage.getItem('cb_token') || '');
  const [isAdmin, setAdmin] = useState(localStorage.getItem('cb_admin') === '1');
  const call = async (path: string, body?: unknown) => {
    const r = await fetch(API + '/api' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Something went wrong');
    return j;
  };
  const login = (t: string, a: boolean) => { localStorage.setItem('cb_token', t); localStorage.setItem('cb_admin', a ? '1' : '0'); setToken(t); setAdmin(a); };
  const logout = () => { localStorage.removeItem('cb_token'); setToken(''); setAdmin(false); };
  return { call, token, isAdmin, login, logout };
}
type Api = ReturnType<typeof useApi>;

export default function App() {
  const api = useApi();
  const [lang, setLang] = useState<'en' | 'ur'>('en');
  const t = T[lang];
  const [f, setF] = useState({ q: '', city: '', make: '', transmission: '', minPrice: '', maxPrice: '', year: '', sort: 'new' });
  const [items, setItems] = useState<L[]>([]);
  const [favs, setFavs] = useState<string[]>([]);
  const [modal, setModal] = useState<'' | 'sell' | 'login' | 'mine' | 'admin' | 'pay' | 'terms' | 'privacy'>('');
  const [sel, setSel] = useState<L | null>(null);

  const load = () => api.call('/listings?' + new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][])).then(setItems).catch(() => {});
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [f]);
  useEffect(() => { if (api.token) api.call('/favorites').then(setFavs).catch(() => {}); else setFavs([]); }, [api.token]);
  const need = (fn: () => void) => (api.token ? fn() : setModal('login'));
  const toggleFav = (id: string) => need(() => api.call('/favorites/' + id, {}).then(setFavs));
  const sf = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const sel_ = 'bg-white text-navy rounded-lg p-2 text-sm';

  return (
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen">
      <header className="bg-navy text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 sticky top-0 z-10">
        <b className="text-xl">Car<span className="text-teal">Bazar</span>.pk</b>
        <div className="flex gap-2 flex-wrap text-sm">
          <button onClick={() => setLang(lang === 'en' ? 'ur' : 'en')} className="px-3 py-1 rounded border border-white/30">{lang === 'en' ? 'اردو' : 'English'}</button>
          {api.token ? <>
            <button onClick={() => setModal('mine')} className="px-2">My ads</button>
            {api.isAdmin && <button onClick={() => setModal('admin')} className="px-2 text-gold">Admin</button>}
            <button onClick={api.logout} className="px-2">Log out</button></> : <button onClick={() => setModal('login')} className="px-3 py-1 rounded border border-white/30">Log in</button>}
          <button onClick={() => need(() => setModal('sell'))} className="px-3 py-1 rounded bg-gold text-navy font-semibold flex items-center gap-1"><Plus size={16} />{t.sell}</button>
        </div>
      </header>

      <section className="bg-navy text-white px-4 pb-6 pt-4">
        <h1 className="text-2xl font-bold">{t.find}</h1>
        <div className="mt-3 flex items-center bg-white rounded-lg px-3 max-w-xl"><Search size={18} className="text-navy/50" />
          <input value={f.q} onChange={sf('q')} placeholder={t.search} className="flex-1 p-3 text-navy outline-none bg-transparent" /></div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <select className={sel_} value={f.city} onChange={sf('city')}><option value="">All cities</option>{CITIES.map(c => <option key={c}>{c}</option>)}</select>
          <select className={sel_} value={f.make} onChange={sf('make')}><option value="">All makes</option>{MAKES.map(c => <option key={c}>{c}</option>)}</select>
          <select className={sel_} value={f.transmission} onChange={sf('transmission')}><option value="">Any gearbox</option><option>Manual</option><option>Automatic</option></select>
          <select className={sel_} value={f.sort} onChange={sf('sort')}><option value="new">Newest</option><option value="low">Price: low</option><option value="high">Price: high</option></select>
          <input className={sel_} type="number" placeholder="Min price" value={f.minPrice} onChange={sf('minPrice')} />
          <input className={sel_} type="number" placeholder="Max price" value={f.maxPrice} onChange={sf('maxPrice')} />
          <input className={sel_} type="number" placeholder="Year from" value={f.year} onChange={sf('year')} />
        </div>
      </section>

      <main className="p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
        {items.length === 0 && <p className="text-navy/60">{t.none}</p>}
        {items.map(l => (
          <div key={l.id} className="relative bg-white rounded-xl p-4 shadow-sm border border-navy/10">
            <button aria-label="Save" onClick={() => toggleFav(l.id)} className="absolute top-6 end-6 bg-white/90 rounded-full p-1"><Heart size={18} className={favs.includes(l.id) ? 'fill-coral text-coral' : 'text-navy'} /></button>
            <button onClick={() => setSel(l)} className="text-start w-full">
              <div className="h-28 rounded-lg bg-gradient-to-br from-navy to-teal mb-3" />
              <h3 className="font-semibold">{l.title}</h3><p className="text-coral font-bold">{pkr(l.price)}</p>
              <p className="text-sm text-navy/70 flex gap-3 mt-1"><span className="flex items-center gap-1"><MapPin size={14} />{l.city}</span><span className="flex items-center gap-1"><Gauge size={14} />{l.mileage.toLocaleString()} km</span><span>{l.year}</span></p>
            </button>
          </div>
        ))}
      </main>

      <footer className="text-center text-sm text-navy/70 p-6 space-x-4">
        <button onClick={() => setModal('pay')}>Featured ads & payment</button><button onClick={() => setModal('terms')}>Terms</button><button onClick={() => setModal('privacy')}>Privacy</button>
        <a href="https://wa.me/923455033254">Contact</a>
      </footer>

      {sel && <Detail l={sel} api={api} need={need} onClose={() => setSel(null)} />}
      {modal === 'login' && <Login api={api} onClose={() => setModal('')} />}
      {modal === 'sell' && <Sell api={api} onClose={() => { setModal(''); load(); }} />}
      {modal === 'mine' && <Mine api={api} onClose={() => setModal('')} />}
      {modal === 'admin' && <Admin api={api} onClose={() => { setModal(''); load(); }} />}
      {modal === 'pay' && <Pay api={api} onClose={() => setModal('')} />}
      {(modal === 'terms' || modal === 'privacy') && <Legal kind={modal} onClose={() => setModal('')} />}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-20 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="float-end"><X /></button>{children}</div>
    </div>
  );
}
const Btn = ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...p} className="w-full bg-teal text-white py-2 rounded-lg font-semibold disabled:opacity-40 mt-2">{children}</button>;
const inp = 'w-full border rounded-lg p-2 mb-2';

function Login({ api, onClose }: { api: Api; onClose: () => void }) {
  const [phone, setPhone] = useState(''); const [code, setCode] = useState(''); const [sent, setSent] = useState(false); const [msg, setMsg] = useState('');
  const send = () => api.call('/auth/otp', { phone }).then(r => { setSent(true); setMsg(r.demoCode ? `Test mode – your code is ${r.demoCode}` : 'Code sent by SMS'); }).catch(e => setMsg(e.message));
  const verify = () => api.call('/auth/verify', { phone, code }).then(r => { api.login(r.token, r.isAdmin); onClose(); }).catch(e => setMsg(e.message));
  return <Modal onClose={onClose}><h2 className="text-lg font-bold mb-3">Log in with phone</h2>
    <input className={inp} placeholder="03XXXXXXXXX" value={phone} onChange={e => setPhone(e.target.value)} inputMode="numeric" />
    {sent && <input className={inp} placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" />}
    {msg && <p className="text-sm text-navy/70">{msg}</p>}
    <Btn onClick={sent ? verify : send}>{sent ? 'Verify' : 'Send code'}</Btn></Modal>;
}

function Detail({ l, api, need, onClose }: { l: L; api: Api; need: (fn: () => void) => void; onClose: () => void }) {
  const [data, setData] = useState<{ month: string; price: number }[]>([]);
  const [amt, setAmt] = useState(''); const [msg, setMsg] = useState('');
  useEffect(() => { api.call('/trends/' + l.id).then(setData).catch(() => {}); }, [l.id]);
  const offer = () => need(() => api.call('/offers', { listingId: l.id, amount: Number(amt) }).then(() => setMsg('Offer sent to seller')).catch(e => setMsg(e.message)));
  const contact = (kind: 'call' | 'wa') => need(() => api.call('/contact/' + l.id).then(r => { window.location.href = kind === 'call' ? 'tel:' + r.phone : wa(r.phone, `Hi, I'm interested in your ${l.title} on CarBazar.pk`); }));
  const report = () => need(() => { const reason = prompt('Why are you reporting this ad?'); if (reason) api.call('/reports', { listingId: l.id, reason }).then(() => setMsg('Thanks, we will review it')); });
  return <Modal onClose={onClose}><h2 className="text-lg font-bold">{l.title}</h2><p className="text-coral font-bold">{pkr(l.price)}</p>
    <p className="text-sm text-navy/70">{l.year} · {l.transmission} · {l.fuel_type} · {l.city}</p>
    <div className="flex gap-2 mt-3"><button onClick={() => contact('call')} className="flex-1 border border-teal text-teal rounded-lg py-2 flex justify-center gap-1"><Phone size={16} />Call</button>
      <button onClick={() => contact('wa')} className="flex-1 border border-teal text-teal rounded-lg py-2 flex justify-center gap-1"><MessageCircle size={16} />WhatsApp</button></div>
    <h3 className="mt-4 text-sm font-semibold">12-month price trend</h3>
    <div dir="ltr" className="h-36"><ResponsiveContainer><LineChart data={data}><XAxis dataKey="month" fontSize={11} /><YAxis hide domain={['auto', 'auto']} /><Tooltip formatter={(v: number) => pkr(v)} /><Line dataKey="price" stroke="#00B8A9" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
    <div className="flex gap-2 mt-2"><input type="number" value={amt} onChange={e => setAmt(e.target.value)} placeholder="Your offer (PKR)" className="flex-1 border rounded-lg p-2" />
      <button onClick={offer} disabled={!amt} className="bg-teal text-white px-4 rounded-lg font-semibold disabled:opacity-40">Offer</button></div>
    {msg && <p className="text-sm text-teal mt-2">{msg}</p>}
    <button onClick={report} className="mt-3 text-xs text-navy/60 flex items-center gap-1"><Flag size={12} />Report this ad</button></Modal>;
}

function Sell({ api, onClose }: { api: Api; onClose: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ transmission: 'Manual', fuel_type: 'Petrol' }); const [msg, setMsg] = useState(''); const [done, setDone] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = () => api.call('/listings', f).then(r => { setDone(true); setMsg(r.status === 'pending' ? 'Submitted! Your ad will appear after admin approval.' : 'Your ad is live.'); }).catch(e => setMsg(e.message));
  return <Modal onClose={done ? onClose : onClose}><h2 className="text-lg font-bold mb-3">Sell your car</h2>
    {!done && <>
      <input className={inp} placeholder="Title (e.g. Toyota Corolla GLi 2018)" onChange={set('title')} />
      <select className={inp} onChange={set('make')}><option value="">Make</option>{MAKES.map(m => <option key={m}>{m}</option>)}</select>
      <input className={inp} type="number" placeholder="Price (PKR)" onChange={set('price')} /><input className={inp} type="number" placeholder="Year" onChange={set('year')} />
      <select className={inp} onChange={set('city')}><option value="">City</option>{CITIES.map(m => <option key={m}>{m}</option>)}</select>
      <input className={inp} type="number" placeholder="Mileage (km)" onChange={set('mileage')} />
      <select className={inp} onChange={set('transmission')}><option>Manual</option><option>Automatic</option></select>
      <Btn onClick={submit}>Post ad</Btn></>}
    {msg && <p className="text-sm mt-2 text-navy">{msg}</p>}</Modal>;
}

function Mine({ api, onClose }: { api: Api; onClose: () => void }) {
  const [ads, setAds] = useState<L[]>([]); const [offers, setOffers] = useState<any[]>([]);
  useEffect(() => { api.call('/my/listings').then(setAds); api.call('/my/offers').then(setOffers); }, []);
  return <Modal onClose={onClose}><h2 className="text-lg font-bold mb-2">My ads</h2>
    {ads.map(a => <p key={a.id} className="text-sm border-b py-1">{a.title} – {pkr(a.price)} <i className="text-navy/60">({a.status})</i></p>)}
    <h2 className="text-lg font-bold mt-4 mb-2">Offers received</h2>
    {offers.length === 0 && <p className="text-sm text-navy/60">No offers yet.</p>}
    {offers.map(o => <p key={o.id} className="text-sm border-b py-1">{pkr(o.amount)} from <a className="text-teal" href={wa(o.from, 'Hi, about your offer on CarBazar.pk')}>{o.from}</a></p>)}</Modal>;
}

function Admin({ api, onClose }: { api: Api; onClose: () => void }) {
  const [q, setQ] = useState<{ pending: L[]; reports: any[] }>({ pending: [], reports: [] });
  const load = () => api.call('/admin/queue').then(setQ); useEffect(() => { load(); }, []);
  const act = (id: string, a: string) => api.call(`/admin/listings/${id}/${a}`, {}).then(load);
  return <Modal onClose={onClose}><h2 className="text-lg font-bold mb-2">Pending ads</h2>
    {q.pending.length === 0 && <p className="text-sm text-navy/60">Nothing to approve.</p>}
    {q.pending.map(a => <div key={a.id} className="text-sm border-b py-2">{a.title} – {pkr(a.price)} ({a.seller})
      <div className="flex gap-2 mt-1"><button onClick={() => act(a.id, 'approve')} className="bg-teal text-white px-3 rounded">Approve</button><button onClick={() => act(a.id, 'remove')} className="bg-coral text-white px-3 rounded">Reject</button></div></div>)}
    <h2 className="text-lg font-bold mt-4 mb-2">Reports</h2>
    {q.reports.map(r => <div key={r.id} className="text-sm border-b py-2">Ad {r.listingId}: {r.reason}<button onClick={() => act(r.listingId, 'remove')} className="ms-2 text-coral">Remove ad</button></div>)}</Modal>;
}

function Pay({ api, onClose }: { api: Api; onClose: () => void }) {
  const [p, setP] = useState<any>(null); useEffect(() => { api.call('/payments').then(setP); }, []);
  return <Modal onClose={onClose}><h2 className="text-lg font-bold mb-2">Featured ads & payment</h2>
    {p && <div className="text-sm space-y-2"><p><b>Easypaisa:</b> {p.easypaisa}</p><p><b>JazzCash:</b> {p.jazzcash}</p>
      <p><b>{p.bank.name} (bank transfer):</b><br />IBAN {p.bank.iban}{p.bank.title && <><br />Title: {p.bank.title}</>}</p><p className="text-navy/70">{p.note}</p>
      <a className="block text-center bg-teal text-white py-2 rounded-lg" href={wa('03455033254', 'Hi, I paid for a featured ad. Ad ID: ')}>Send payment proof on WhatsApp</a></div>}</Modal>;
}

function Legal({ kind, onClose }: { kind: 'terms' | 'privacy'; onClose: () => void }) {
  return <Modal onClose={onClose}><h2 className="text-lg font-bold mb-2">{kind === 'terms' ? 'Terms of Use' : 'Privacy Policy'}</h2>
    <p className="text-sm text-navy/80 space-y-2">{kind === 'terms'
      ? 'CarBazar.pk is a marketplace that connects buyers and sellers. We do not own, inspect or guarantee any vehicle. Sellers must post accurate information and only cars they are entitled to sell. Fake, duplicate or fraudulent ads are removed and accounts banned. Always inspect the car and verify documents before paying. Never send money in advance to unknown sellers.'
      : 'We collect your phone number to log you in and to let buyers and sellers contact each other. We store the ads, offers and saved cars you create. We do not sell your data. Phone numbers are shown only to logged-in users who tap Call or WhatsApp. You can ask us to delete your account and data by contacting us on WhatsApp.'}</p>
    <p className="text-xs text-navy/50 mt-3">Draft text. Have a lawyer review it before launch.</p></Modal>;
}
