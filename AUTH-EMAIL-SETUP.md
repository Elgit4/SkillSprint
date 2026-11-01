# SkillSprint authentication setup

## Local email/password testing

1. Open Supabase Dashboard → Authentication → Sign In / Providers → Email.
2. For private local testing only, you may temporarily turn **Confirm email** off if no verified SMTP sender is configured.
3. Register using an email address, a public username, a display name and a unique password with at least 8 characters.
4. If email confirmation is enabled, confirm the address before signing in.
5. For password recovery, configure the exact local app URL as an allowed redirect URL in Authentication → URL Configuration.

For public release, turn email confirmation back on and configure a verified SMTP provider. Do not disable confirmation as a permanent production setting.

## Google OAuth (optional)

Enable Google under Authentication → Sign In / Providers, add the OAuth client credentials, and register the Supabase callback URL with Google. Add the local app URL and production URL to Supabase's redirect allow-list. Until this is configured, use email/password sign-in.

## Browser environment

Use only the project URL and publishable/anon key in `.env.local`:

```env
VITE_SUPABASE_URL=https://nmhinrfurfhtnonshyfk.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

The application also reads the older `VITE_SUPABASE_ANON_KEY` variable for compatibility. Never expose a service-role/secret key to the browser.
