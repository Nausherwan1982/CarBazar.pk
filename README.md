# CarBazar.pk

CarBazar.pk is a React and Express prototype for a Pakistan-focused car marketplace. It includes searchable sample listings, listing details, favorites, offers, admin moderation, and a demo OTP login for local development.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm ci
npm run lint
npm run dev
```

Optionally copy `.env.example` to `.env` for local defaults. Open [http://localhost:3000](http://localhost:3000). Local development uses `data.json` for persistence and displays a demo OTP in the login screen. Do not use demo authentication or local-file storage for a public production service.

## Production readiness

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for production environment variables and hosting instructions. Production requires PostgreSQL and a randomly generated `JWT_SECRET`; it refuses to start without them. Demo OTP mode is disabled in production. Phone login additionally requires configured Twilio SMS credentials; without them, browsing remains available but sign-in is disabled.

The project is an MVP, not a complete commercial marketplace. It does not provide photo uploads, real-time in-app chat, verified SMS login until SMS is configured, or online payment processing. Offers and seller contact currently use the app API and phone/WhatsApp links; the price trend and starter listings are sample data.

## Commands

```bash
npm run dev    # Local development server
npm run lint   # TypeScript check
npm run build  # Production frontend build
npm start      # Serve the production build
```
