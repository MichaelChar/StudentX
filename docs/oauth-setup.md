# Student OAuth Setup — Google + Apple

The student `Continue with Google` / `Continue with Apple` buttons go live the moment Supabase has provider credentials. The app itself is fully wired (`feat/oauth-sso` / migration `030_oauth_student_role.sql`); no app env vars or rebuild are required.

## What Michael needs to do

All work happens in the Supabase Dashboard for project `ecluqurlfbvkxrnoyhaq` ([dashboard link](https://supabase.com/dashboard/project/ecluqurlfbvkxrnoyhaq/auth/providers)).

### 1. Authentication → URL Configuration

- **Site URL**: `https://studentx.uk`
- **Redirect URLs** (add all four):
  - `https://studentx.uk/en/student/auth/callback`
  - `https://studentx.uk/el/student/auth/callback`
  - `http://localhost:3000/en/student/auth/callback`
  - `http://localhost:3000/el/student/auth/callback`

### 2. Authentication → Providers → Google

1. In **Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com/)) → APIs & Services → Credentials, create an **OAuth 2.0 Client ID**:
   - Application type: **Web application**
   - Authorized redirect URI: `https://ecluqurlfbvkxrnoyhaq.supabase.co/auth/v1/callback`
2. In Supabase → Authentication → Providers → Google:
   - Enable the provider.
   - Paste the **Client ID** and **Client Secret** from Google Cloud.
   - Save.

### 3. Authentication → Providers → Apple

1. In **Apple Developer** ([developer.apple.com](https://developer.apple.com/), paid account required):
   - **App ID**: enable the *Sign in with Apple* capability on the bundle ID.
   - **Services ID** (this is the OAuth Client ID): create one. Configure its Return URL to `https://ecluqurlfbvkxrnoyhaq.supabase.co/auth/v1/callback`.
   - **Sign in with Apple Key**: Keys → `+`, enable Sign in with Apple, attach the App ID, save, and download the `.p8` private key (one-time download).
2. In Supabase → Authentication → Providers → Apple:
   - Enable the provider.
   - **Client ID** = Services ID
   - **Team ID** = Apple Developer Team ID
   - **Key ID** = the key's Key ID
   - **Secret Key** = paste the `.p8` file contents verbatim (Supabase signs the JWT for you)
   - Save.

## What is *not* required

- **No new app env vars.** The browser client only needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which already ship with `.env.production`. Provider credentials never leave Supabase.
- **No code redeploy.** Once the dashboard config is saved, the next OAuth click works against the existing Cloudflare deploy.

## How the flow works

1. User clicks **Continue with Google / Apple** on `/[locale]/student/login` or `/signup`.
2. The browser is redirected to the provider, then back to `https://ecluqurlfbvkxrnoyhaq.supabase.co/auth/v1/callback`, which in turn redirects to `https://studentx.uk/[locale]/student/auth/callback#access_token=...`.
3. The callback page parses the session, posts the access token to `/api/auth/session` (cookie sync), calls the idempotent `/api/student/profile` POST, then forwards to `?next=` (if set by `AuthGate`) or `/student/account`.
4. Profile provisioning has two layers:
   - **Database trigger** (migration 030): fires on `auth.users` insert when `raw_user_meta_data.role = 'student'` *or* `raw_app_meta_data.provider IN ('google','apple')`. Inserts the `students` row with `ON CONFLICT DO NOTHING`.
   - **Callback page POST**: calls `create_student_profile` RPC, also idempotent via the same conflict guard.

## Local dev caveat

`supabase/config.toml` keeps Apple disabled and lacks a Google block, so `supabase start` won't run OAuth locally. To exercise OAuth in development, point `NEXT_PUBLIC_SUPABASE_URL` at the hosted project (the credentials already live there) — the `localhost` redirect URLs above support this.
