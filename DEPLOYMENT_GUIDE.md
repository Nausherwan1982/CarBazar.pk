# CarBazar.pk deployment guide

## Local development

Requirements: Node.js 20 or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. The local server stores development data in `data.json`; demo OTP is enabled locally unless `OTP_DEMO=false`.

## Production deployment

Deploy to a Node.js host (for example, Render or Railway) that supports a persistent PostgreSQL database.

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check: `GET /` (HTTP 200)

Set these environment variables in the host dashboard:

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string. Use the provider's TLS-enabled URL when required. |
| `JWT_SECRET` | Yes | Random secret of at least 32 bytes. Generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. |
| `OTP_DEMO` | Yes | Set to `false`. Production refuses to start if demo OTP is enabled. |
| `ADMIN_PHONES` | Recommended | Comma-separated admin phone numbers in `03XXXXXXXXX` format. |
| `PORT` | Host-dependent | Usually set automatically by the host. |
| `CORS_ORIGIN` | Only for a separate frontend | Comma-separated, exact allowed origins, such as `https://www.example.com`. Leave unset when frontend and API share the same origin. |
| `TWILIO_ACCOUNT_SID` | Optional | Twilio account SID. Set all three Twilio variables to enable SMS login. |
| `TWILIO_AUTH_TOKEN` | Optional | Twilio auth token. Keep it in the host's secret manager. |
| `TWILIO_FROM` | Optional | Twilio sender number. The account must be able to send to the destination country. |
| `GEMINI_API_KEY` | Optional | Enables AI-assisted ad descriptions. |
| `PAY_ACCOUNT_TITLE` | Optional | Account title displayed with the manual payment instructions. |

Production fails at startup if PostgreSQL or a sufficiently strong JWT secret is missing, or if demo OTP is enabled. When Twilio credentials are omitted, the site can serve public listings, but phone login and authenticated actions are unavailable; the OTP endpoint returns an explicit configuration error. OTP delivery failures are reported to the requester and logged without logging verification codes.

`npm start` serves the built frontend and API from the same process. Keep `DATABASE_URL`, `JWT_SECRET`, and any provider credentials out of source control. Local `data.json` is ignored by Git and is not used for production persistence.

### Deploying on Render

The repository includes a Render Blueprint in `render.yaml`. Push the project to a Git provider supported by Render, then create a Blueprint from that repository in the Render Dashboard. Review the selected paid web-service and PostgreSQL plans before confirming. The Blueprint provisions both services in Singapore, connects PostgreSQL to the web service, generates `JWT_SECRET`, and disables demo OTP for production.

After the first deploy, set `ADMIN_PHONES` in the web service's environment settings if an admin account is needed. To enable sign-in, add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM` there and verify SMS delivery before launch. Without Twilio, public browsing works but phone sign-in is unavailable.

## Current feature limits

Before opening the service to real users, account for these features that are not implemented:

- Vehicle photo upload and the documented multi-angle photo workflow.
- Real-time in-app buyer/seller chat.
- Online payment gateway and automatic payment verification; payment instructions are manual.
- Real historical vehicle valuation data; the trend chart uses generated demo data.
- SMS login unless Twilio is configured and tested with the target phone numbers.

Do not advertise these as available until they are implemented and verified. Review applicable privacy, consumer-protection, telecom, and payment requirements before commercial launch.

## Progressive web app

The app includes a web manifest and service worker for basic offline access to the app shell. Authenticated API responses are deliberately excluded from the service-worker cache.
