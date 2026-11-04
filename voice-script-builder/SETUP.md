# Setup: Phase 2 recording proof

1. **Supabase:** create one Free project. Don't enable any paid add-on or custom SMTP.
2. **Turn off email confirmation** (the app uses usernames, not real emails):
   Authentication → Sign In / Providers (older dashboards: Providers) → **Email** → switch **Confirm email** off → Save.
   Leave "Allow new users to sign up" on.
3. **SQL Editor:** paste and run `supabase/schema.sql` once. (Already ran an earlier version? Run `migration-002-user-cleanup.sql` through `migration-008-bulk-section-assignment.sql` in order, once each.) If a migration errors partway, tell me the message rather than re-running it.
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

Imported scripts are saved in the project database. Open **Scripts** from a project to view them; each section links to its recording page, and text edits there appear in the linked script. Existing installs need `migration-006-script-library.sql`.

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

## Removing projects, people and test accounts

**Delete a project (in the app, owner only):** open the project, scroll to **Delete this project**, type its name, and confirm. This deletes the sections, members, invite codes and every recording file, including old takes.

**Remove a person from a project:** open the project; the owner sees **Remove** beside each cast member, and cast members see **Leave project** beside their own name. Their saved takes stay in the project. Their account stays too (see below).

**Delete test accounts completely.** Accounts can't be deleted from inside the app; you do it from the dashboard. Deleting an account also deletes every project it owns, its memberships, and its takes, so check the list first. Audio files are *not* removed automatically by this route, so clear them first.

One-time setup (skip if you started from the updated `schema.sql`): run `supabase/migration-002-user-cleanup.sql` in the SQL Editor. Without it, deleting an account that ever recorded fails with a foreign key error.

1. **See what you have.** SQL Editor → New query → Run:

   ```sql
   select u.email, count(distinct p.id) as projects, count(distinct r.id) as takes
   from auth.users u
   left join public.projects p on p.owner_id = u.id
   left join public.recordings r on r.uploader_id = u.id
   where u.email like '%@users.example.com'
   group by u.email order by u.email;
   ```
   Note which usernames are test accounts. Anything you want to keep must not be on your delete list.

2. **Delete their audio files.** First find the project IDs:

   ```sql
   select id, name, owner_id from public.projects;
   ```
   Then in the dashboard: **Storage** → **recordings** bucket. Each folder is named after a project ID. Tick the folders for the projects you're deleting and delete them. Do the same in the **backing** bucket if it has folders. If everything is test data, delete all folders.

3. **Delete the accounts.** New query, edit the list to the test emails (username + `@users.example.com`), Run:

   ```sql
   delete from auth.users
   where email in ('test1@users.example.com', 'test2@users.example.com')
   returning email;
   ```
   The result lists each deleted account. This can't be undone.
   (Authentication → Users → the row's menu → Delete user does the same for one account, but run step 2 first either way.)

4. **Check.** Re-run the query from step 1; the deleted usernames should be gone.
