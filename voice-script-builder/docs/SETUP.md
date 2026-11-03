# Setup: Phase 2 recording proof

1. **Supabase:** create one Free project. Don't enable any paid add-on or custom SMTP.
2. **Auth → URL Configuration:** set Site URL to your GitHub Pages URL for this folder, and add it to Redirect URLs (needed for confirmation and password-reset links).
3. **SQL Editor:** paste and run `supabase/schema.sql` once. If it errors partway, tell me the message rather than re-running (tables aren't `if not exists`).
4. **Project Settings → API:** copy the Project URL and the `anon` public key into `config.js`. Never use the `service_role` key.
5. **Try it locally:** `python3 -m http.server 8000` in this folder, open `http://localhost:8000` (localhost allows the microphone; other hosts need HTTPS).
6. **Phase 2 exit check, on real phones (iOS Safari + Android Chrome):**
   - Account A: sign up, create a project, record a take on "Test clip", play it back.
   - A: Create invite code. Account B (second device): sign up, join with the code, play A's take.
   - Account C (not invited): confirm it sees no project and can't play the take.
   - Also try: deny mic permission, lose connection mid-upload, record past 2 minutes, record again and make the upload fail (the old take must survive).