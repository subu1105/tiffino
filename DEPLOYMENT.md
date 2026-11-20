# TIFFINO — Production Deployment

Three pieces, deployed in this order:

| Piece | Where | Cost |
| --- | --- | --- |
| Database (MongoDB Atlas) | already live — `tiffino_v2` | free tier |
| API (Node/Express) | Render.com | free (or $7/mo always-on) |
| Web app (React) | Hostinger Business — `public_html` | already paid |
| Phone app (APK) | EAS Build → install on phone | free |

> Hostinger Business (shared hosting) can serve the **web app** but cannot run
> a **Node.js server** — that's why the API goes to Render. The same Atlas
> database keeps being used, so all existing data and logins stay as they are.

---

## Part 0 — One-time prep

1. Push this repo to **GitHub** (private repo is fine).
2. MongoDB Atlas → **Network Access** → add IP `0.0.0.0/0` (allow from
   anywhere) — Render's IPs change, and the strong DB password protects access.

## Part 1 — API on Render

1. Go to **render.com** → sign up with your GitHub account.
2. **New + → Blueprint** → pick this repo. Render reads `render.yaml`
   automatically.
3. It asks for three secret values:
   - `MONGODB_URI` — copy from `apps/api/.env` (the `mongodb+srv://...` line).
   - `JWT_ACCESS_SECRET` — a long random string; generate one with
     `openssl rand -hex 32`.
   - `CORS_ORIGINS` — your web domain(s), e.g.
     `https://yourdomain.com,https://www.yourdomain.com`.
4. Deploy. You get a URL like `https://tiffino-api.onrender.com` — open
   `https://tiffino-api.onrender.com/api/health` and check for `"status":"ok"`.

### Custom domain (IMPORTANT for web login)

Give the API a subdomain of **your own domain** so the web app's login
cookie works (web and API must be on the same site):

1. Render → your service → **Settings → Custom Domains** → add
   `api.yourdomain.com`.
2. Hostinger hPanel → **Domains → DNS Zone** → add a **CNAME** record:
   name `api`, target `tiffino-api.onrender.com`.
3. Wait a few minutes; Render issues the SSL certificate itself.

Without this step the **APK still works fine** (the phone app doesn't use
cookies), but the **web app** would log users out after ~15 minutes.

### Free-plan sleep

The free plan sleeps after 15 idle minutes (first request then takes ~50s).
Fix: create a free monitor at **cron-job.org** or **uptimerobot.com** that
hits `/api/health` every 10 minutes — or upgrade the service to Starter.

## Part 2 — Web app on Hostinger

1. Create `apps/web/.env.production` (copy `.env.production.example`) and set
   the real URL: `VITE_API_URL=https://api.yourdomain.com/api`.
   All `.env*` files stay out of git — only the `*.example` templates are
   committed.
2. Build: `pnpm --filter @tiffino/web build` → output in `apps/web/dist/`.
3. Hostinger hPanel → **Files → File Manager** → open `public_html` →
   delete the default files → upload the **contents** of `apps/web/dist/`
   (enable "show hidden files" so `.htaccess` comes along — it makes page
   refresh and direct links work).
4. Open `https://yourdomain.com` → log in with the same email/password as
   today. If login fails with a CORS error, re-check `CORS_ORIGINS` on Render
   (exact spelling, `https://`, no trailing slash).

Re-deploying after changes = build again + re-upload `dist/`.

## Part 3 — Phone APK

The APK is the real standalone app — once installed, **Expo Go is not needed**
and the phone works from anywhere (the app talks to the Render API).

1. Create a free account at **expo.dev**.
2. On the laptop: `npm install -g eas-cli` then `eas login`.
3. Check `apps/mobile/eas.json` — `EXPO_PUBLIC_API_URL` must be your API
   host **without** `/api`, e.g. `https://api.yourdomain.com`.
4. Build in the cloud (free queue, ~10–20 min):
   ```bash
   cd apps/mobile
   eas build --platform android --profile production
   ```
   First run asks to register the project — accept the defaults.
5. When it finishes you get a **download link for the .apk**. Open it on the
   phone (or send via WhatsApp), tap the file, allow "install unknown apps",
   install. TIFFINO appears as a normal app with its own icon.
6. App update later = run the same build command again, install the new APK
   over the old one (version increments automatically).

## Quick checklist

- [ ] Repo on GitHub, Atlas allows `0.0.0.0/0`
- [ ] Render blueprint deployed, `/api/health` ok
- [ ] `api.yourdomain.com` CNAME added, green on Render
- [ ] Keep-alive monitor pinging `/api/health`
- [ ] `.env.production` edited → web built → `dist/` uploaded to `public_html`
- [ ] Web login works on the domain
- [ ] `eas.json` URL checked → APK built → installed on phone
