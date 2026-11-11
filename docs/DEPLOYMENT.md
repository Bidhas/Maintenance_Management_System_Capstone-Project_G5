# CMMS - Deployment runbook

This is the day-to-day reference for the live CMMS site. (The one-off setup steps are in the Sprint 7 guide.)

## 1. How it fits together

```
Developer -> Pull request into develop
                 |
                 v
         GitHub Actions: tests -> Docker build check
                 |  (merge)
                 v
         GitHub Actions "deploy" job -> calls Render Deploy Hook
                 |
                 v
         Render builds the Dockerfile -> starts one container
                 |
                 v
   Express serves the API (/api/*) AND the built React app
                 |
                 v
         Supabase PostgreSQL (session pooler, SSL)
```

- One Render **Web Service**, runtime **Docker**, branch **develop**, region **Singapore**.
- Render's own *Auto-Deploy* is **Off**. Deploys happen only through the pipeline, so nothing reaches the live site unless the tests pass.
- Google sign-in, the maintenance log, notifications and email all run inside that one container.

## 2. Environment variables (set on Render, never in the repository)

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase **session pooler** connection string | Secret |
| `DATABASE_SSL` | `true` | |
| `JWT_SECRET` | long random string | Secret. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `GOOGLE_CLIENT_ID` | `...apps.googleusercontent.com` | Not secret |
| `ALLOWED_EMAIL_DOMAIN` | `rub.edu.bt` | |
| `ALLOW_PASSWORD_LOGIN` | `false` | Google sign-in only on the live site |
| `NODE_ENV` | `production` | Already set inside the image; harmless to repeat |
| SMTP settings | same variable names as in your working `server/.env` | Secret (app password) |

`PORT` is provided by Render automatically. Do not set it.

## 3. Everyday tasks

**Release a change.** Branch from `develop` -> PR -> wait for the green check -> merge. The pipeline deploys by itself. Watch it in Render > the service > **Events**.

**Redeploy without a code change.** GitHub > Actions > the latest "CI/CD" run on `develop` > **Re-run all jobs**. Or Render > **Manual Deploy > Deploy latest commit**.

**Change an environment variable.** Render > the service > **Environment** > edit > Save. Render restarts the service. No code change is needed.

**Roll back a bad release.** Render > the service > **Events** > find the last good deploy > **Rollback**. Then fix the problem on a branch and release normally.

**Read the logs.** Render > the service > **Logs**.

## 4. Things that will surprise you on the free plan

- **Sleep.** The service sleeps after about 15 minutes without traffic. The next request takes about a minute. Open the site before demos and user testing.
- **Temporary disk.** Photos attached to requests live on the container disk and are deleted on every redeploy/restart. Requests and all other data are safe (they are in Supabase). A permanent fix is Supabase Storage or a paid persistent disk.
- **Outbound email.** Render is believed to block the standard SMTP ports (25, 465, 587) on free web services. If email does not arrive on the live site, see "Email" in the Sprint 7 guide. The app keeps working without it; notifications never crash a request.

## 5. Secrets hygiene

- Never commit `.env`. `.dockerignore` also keeps it out of the image.
- The Render Deploy Hook URL is a password: anyone holding it can trigger deploys. It lives only in the GitHub secret `RENDER_DEPLOY_HOOK_URL`. If it leaks, Render > Settings > Deploy Hook > regenerate, then update the GitHub secret.
- Rotate the Gmail app password if it was ever shared in a chat.

## 6. If the Render URL ever changes

Re-creating the service gives a new `*.onrender.com` address. Add the new address under **Authorised JavaScript origins** for the OAuth client in Google Cloud, or Google sign-in will fail with `origin_mismatch`.

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Deploy job fails: "secret is not set" | `RENDER_DEPLOY_HOOK_URL` missing | Add it under GitHub Settings > Secrets and variables > Actions |
| Render build fails at `npm run build` | client code error | Reproduce with `npm run build --prefix client`; fix on a branch |
| Render says port scan timeout / 502 | server crashed at start | Read Render Logs; usually a missing env variable or a wrong `DATABASE_URL` |
| `ETIMEDOUT` or `ENETUNREACH` to the database | wrong or direct connection string | Use the Supabase **session pooler** string |
| No Google button | `GOOGLE_CLIENT_ID` missing on Render | Set it and let Render restart |
| Google: `origin_mismatch` | live URL not added in Google Cloud | Add it exactly (https, no trailing slash); wait a few minutes |
| "We could not verify your Google sign-in" | wrong `ALLOWED_EMAIL_DOMAIN` / client ID | Fix the variables on Render |
| Everyone is locked out after a few failed logins | rate limiter sees one IP | Confirm `app.set('trust proxy', 1)` is in `server/src/app.js` |
| First page load takes about a minute | free plan was asleep | Normal; wait, then reload |
