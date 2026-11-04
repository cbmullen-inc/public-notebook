# Setup: Phase 2 recording proof

1. **Supabase:** create one Free project. Don't enable any paid add-on or custom SMTP.
2. **Turn off email confirmation** (the app uses usernames, not real emails):
   Authentication → Sign In / Providers (older dashboards: Providers) → **Email** → switch **Confirm email** off → Save.
   Leave "Allow new users to sign up" on.
3. **SQL Editor:** paste and run `supabase/schema.sql` once. If it errors partway, tell me the message rather than re-running (tables aren't `if not exists`).
4. **Keys:** in Project Settings → API:
   - `SUPABASE_URL` = the root address only, like `https://abcdefgh.supabase.co`. If the Data API page shows it with `/rest/v1` on the end, delete that part.
   - `SUPABASE_ANON_KEY` = the **Publishable key** (`sb_publishable_...`) from the API Keys page. Legacy projects may show an `anon` key instead; that works too.
   - Never use the **Secret key** (`sb_secret_...`) or `service_role` key anywhere in this repository.
5. **Try it locally:** `python3 -m http.server 8000` in this folder, then open `http://localhost:8000` (localhost allows the microphone; other hosts need HTTPS).
6. **Phase 2 exit check, on real phones (iOS Safari + Android Chrome):**
   - Account A: create an account, create a project, record a take on "Test clip", play it back.
   - A: Create invite code. Account B (second device): create an account, join with the code, play A's take.
   - Account C (not invited): confirm it sees no project and can't play the take.
   - Also try: deny mic permission, lose connection mid-upload, record past 2 minutes, record again and make the upload fail (the old take must survive).

Not wired into `deploy-site.yml` yet.

## How usernames work

A username like `ana` is stored by Supabase as the placeholder email `ana@users.example.com`. No email is ever sent. The app adds and hides that suffix, so people only see `ana`. There is no self-service password reset; the owner resets passwords as described below.

## Resetting someone's password (from the dashboard)

You need: the person's **username**, and a temporary password you make up (8+ characters). No coding needed; you paste one command.

1. Open your project at supabase.com/dashboard.
2. Confirm the user exists: left sidebar → **Authentication** → **Users**. Find their address, e.g. `ana@users.example.com` (username + `@users.example.com`). If it isn't listed, they never created an account.
3. Left sidebar → **SQL Editor** → **New query** (a blank editor).
4. Paste this, then edit **both** quoted parts: the temporary password, and the email (their username + `@users.example.com`, all lowercase):

   ```sql
   update auth.users
   set encrypted_password = extensions.crypt('TempPassword-2468', extensions.gen_salt('bf'))
   where email = 'ana@users.example.com'
   returning email;
   ```
5. Click **Run** (or Ctrl/Cmd + Enter).
6. Check the result: you should see **one row** containing their email. If it says no rows returned, the email was misspelled; fix it and run again. Don't edit anything else.
7. Tell the person their temporary password (message them privately), and ask them to sign in with it.
8. Clean up: close the query tab without saving it, or delete it from the saved queries list, so the temporary password isn't left lying around.

Notes:
- The password is stored securely (hashed); the command never reveals existing passwords, since nobody can read them.
- Possible caveat: the Authentication → Users page may also offer a direct "reset password" option in the user's menu. Newer dashboards change often, so I haven't relied on it. The SQL method above doesn't depend on it.
- The app has no "change my password" screen yet, so the temporary password stays until you reset it again. I can add a change-password screen next if you'd like.
