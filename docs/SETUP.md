# Setup: getting Pantry onto your phones

About 15 minutes, once. You need two free accounts: **Supabase** (the shared database)
and **Vercel** (the website host), plus an **Anthropic API key** for recipe suggestions
(step 5; pay-as-you-go). After this, every update to the code goes live on its own.

> Without any setup, the app still runs in **device-only mode**: everything works, but
> data lives only on that one device and isn't shared or backed up.

---

## 1. Supabase: the shared database

1. Go to **https://supabase.com** → **Start your project** → sign in with GitHub.
2. **New project**
   - Name: `pantry`
   - Database password: click **Generate** (you won't need it again)
   - Region: the one closest to you
   - Click **Create new project** and wait about a minute.
3. **Create the tables:** left sidebar → **SQL Editor** → **New query**. Open
   [`supabase/schema.sql`](../supabase/schema.sql) in this repo, copy the whole file, paste
   it in, and click **Run**. You should see "Success. No rows returned".
4. **Make sign-in emails include a code** (needed for the installed iPhone app):
   left sidebar → **Authentication** → **Emails** → **Magic Link** template. Replace the
   body with:

   ```html
   <h2>Sign in to Pantry</h2>
   <p>Your code: <strong style="font-size:24px;letter-spacing:4px">{{ .Token }}</strong></p>
   <p>Or <a href="{{ .ConfirmationURL }}">tap here to sign in</a>.</p>
   ```

   Click **Save**.
5. **Copy two values** for step 2: **Project Settings** (gear icon) → **API Keys** /
   **Data API**:
   - **Project URL**: looks like `https://abcdefgh.supabase.co`
   - **Publishable key**: starts with `sb_publishable_…` (on older projects it's the
     key labelled `anon` `public`). This key is designed to be public; the database rules
     in `schema.sql` are what keep each household's data private.

## 2. Vercel: the website

1. Go to **https://vercel.com** → sign up with GitHub.
2. **Add New… → Project** → import **`pantry-tracker`**. (If you don't see it, click
   *Adjust GitHub App Permissions* and give Vercel access to the repo.)
3. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_KEY` | your publishable key |

4. Click **Deploy**. After about a minute you get a URL like `https://pantry-tracker-xyz.vercel.app`.
   (Optional: *Settings → Domains* to choose a nicer name.)

## 3. Tell Supabase your website's address

Back in Supabase → **Authentication** → **URL Configuration**:

- **Site URL**: your Vercel URL
- **Redirect URLs**: add your Vercel URL too

Save. This lets the "tap here to sign in" link in the email return to your app.

## 4. Install on your phone

1. Open your Vercel URL on your phone.
2. Sign in with your email, entering the 6-digit code from the email.
3. Create your kitchen.
4. **Add to Home Screen**
   - **iPhone:** in Safari, tap Share, then **Add to Home Screen**.
   - **Android:** in Chrome, tap ⋮, then **Install app**.
5. **Invite your household:** Settings → **Invite someone** sends them a link. They open
   it, sign in with their own email, and they're in.

The first time you open Scan, allow camera access.

## 5. Recipes: Anthropic API key

Recipe suggestions and recipe import use Claude. Everything else works without this.

1. Go to **https://console.anthropic.com** → sign up → **Billing** → add a small amount of
   credit. Each "Suggest recipes" costs roughly 5–20¢; importing a recipe costs less.
2. **API Keys → Create Key**, name it `pantry`, and copy it.
3. In Vercel → your project → **Settings → Environment Variables**, add
   `ANTHROPIC_API_KEY` with that value. (No `VITE_` prefix: it must stay on the server.)
4. **Deployments** → ⋯ on the latest → **Redeploy**.

Only signed-in members of your household can use it, so the key can't be spent by strangers.

## Updating

When a new version adds database tables (the README will say so), open Supabase → **SQL
Editor**, paste the latest [`supabase/schema.sql`](../supabase/schema.sql) again and click
**Run**. It's safe to re-run; it only adds what's missing.

---

## Good to know

- **Sign-in emails:** Supabase's built-in email sender allows only a few emails per hour.
  That's plenty for a household, but if you try several times in a row, wait a bit.
- **Pausing:** free Supabase projects pause after about a week with *no* use. Daily use
  keeps it awake. If it ever pauses, click **Restore** on the Supabase dashboard.
- **Barcode lookups** use Open Food Facts first, then UPCitemdb's free tier (about 100 lookups
  a day). Anything you've scanned before is remembered and never looked up again.
- **Offline:** the app keeps working without signal. Changes sync when you're back online
  (the badge at top right shows "Offline · 3 to sync").

## Running it on a computer (for development)

```bash
npm install
cp .env.example .env.local   # optional: Supabase values, ANTHROPIC_API_KEY for recipes
npm run dev                  # http://localhost:5173 (also serves /api/*)
npm test                     # unit tests
```

Phone cameras need HTTPS, so test scanning on the deployed Vercel URL (or with
`npm run dev` on the same Wi-Fi using a tunnel such as `npx localtunnel --port 5173`).
