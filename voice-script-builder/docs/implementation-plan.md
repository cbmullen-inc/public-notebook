# Voice Script Builder — Implementation Plan

## Goal

Build an installable phone-friendly app where a project owner can add a script,
divide it into sections, assign each section to a person, optionally attach
backing audio, and let cast members record and review their assigned sections.
The owner and cast should be able to see recording progress and listen to a
project summary.

## Recommended first release

Keep the first release focused on one project workflow:

- The owner creates a project and adds a plain-text script.
- The owner divides it into named scenes or sections, assigns a person, and
  chooses a highlight color for that person.
- A cast member opens the project, sees their assigned sections, and records
  or replaces a take for each section.
- Project members can play completed takes and see which sections are still
  outstanding.
- An optional backing track can play while a section is recorded.
- The app can be installed as a PWA, but recording and syncing require an
  internet connection in this release.

Defer document-format parsing, public project links, offline recording and
sync, automatic script highlighting, and elaborate audio editing until the
basic workflow has been tested with real users.

## Free-tier architecture and cost guardrails

This repository publishes static pages on GitHub Pages. It can host the PWA
interface, but it cannot securely manage accounts, project membership, or
private audio uploads by itself. Keep every hosted dependency on its free tier:

- **Frontend:** a new `voice-recorder/` folder with HTML, CSS, and JavaScript,
  following the standalone-app style of `ear-training/`.
- **Backend:** one Supabase Free project for Auth, Postgres, and private
  Storage. Enforce project membership and ownership with Row Level Security
  and storage policies. Use Supabase's built-in auth email delivery only;
  do not configure paid SMTP or another email provider. The browser may use
  the public client key; never put a service-role key or other secret in the
  repository.
- **Deployment:** GitHub Pages and the repository's existing GitHub Actions
  workflow. Extend `.github/workflows/deploy-site.yml` to copy the app folder
  to the published site and trigger on its changes. Do not add a paid host,
  custom domain, or CDN.
- **Other services:** no paid APIs, analytics, error-reporting services,
  add-ons, or external media hosting. Keep scripts and audio out of the public
  GitHub repository.

The Supabase Free tier currently lists 500 MB of database space, 1 GB of file
storage, 5 GB of egress, 50,000 monthly active users, and up to two active
projects. Free projects may pause after a week of inactivity. Limits and
features can change; confirm the current [Supabase pricing](https://supabase.com/pricing)
before setup. Treat these quotas as hard ceilings, not targets: audio,
backing tracks, and playback traffic will be the limiting resources. Use one
project, cap recording duration and upload size, show storage-related errors,
and delete audio when users delete takes or projects. Do not silently fall
back to public storage or another paid service when a quota is reached.

GitHub Pages and GitHub Actions are used only for the public app shell and
deployment, never private user content. Check the current
[GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
Do not add billing, paid plans, or paid add-ons to either provider. This is a
small-pilot design with no uptime guarantee, not a promise of free operation
at arbitrary scale. Supabase Free projects can pause, and the free tier does
not include paid-plan backups; make and periodically verify a manual export of
critical project metadata and give project owners a way to download recordings.

## Main data

- **Project:** name, owner, creation time.
- **Member:** project, user, role (`owner` or `cast`), display name, color.
- **Section:** project, order, title, script text, assigned member(s), optional
  backing-track reference.
- **Recording:** section, uploader, private storage path, media type, duration,
  creation time, and whether it is the current take.
- **Backing track:** project, private storage path, display name, media type.

Keep old takes when a member re-records, but mark only one take as current.
This supports redo and history without replacing a file in place. Show section
status from its recording state: unrecorded when there is no current take and
done when a current take is saved. Add an explicit in-progress state only if
testing shows that users need drafts that survive leaving a section.

## Implementation phases

### 1. Confirm product and privacy decisions

- Decide whether a section can be assigned to more than one person.
- Decide how cast members join: individual accounts invited by the owner are
  recommended; use an owner-generated, single-use invite code shared directly,
  not email invitations or guessable public project links.
- Confirm what script files to support. Start with pasted text or `.txt`;
  add PDF/DOCX only if needed.
- Decide whether backing audio is only played during recording or should be
  mixed into the saved take. Recommended first release: play it for reference
  and save the microphone recording alone.
- Agree on who can listen to takes, who can delete them, and how long projects
  and recordings are retained.
- Get informed agreement from people whose voices are recorded; provide a
  clear way to leave a project and request deletion.

**Exit check:** these choices are documented before the database and sharing
rules are built.

### 2. Prove the free-tier platform and recording path

- Create the minimal PWA shell, a single Supabase Free project, sign-in flow,
  single-use invite-code flow, and private project access rules. Confirm email
  confirmation and password recovery work within Supabase's built-in free
  auth email limits; do not solve a limit by enabling paid email delivery.
- Use `MediaRecorder` to record a short microphone sample, play it back, upload
  it privately, and replay it on a second device.
- Test permission denial, interruption, a lost connection, and unsupported
  recording formats.
- Test current iOS Safari and Android Chrome on actual phones. Confirm the
  deployed HTTPS origin, install flow, and supported audio types.
- Test quota behavior and project pause/recovery. Set conservative per-clip
  duration and size limits and verify that exceeding a limit produces a clear
  error without losing an existing take.

**Exit check:** a member can sign in on a phone, record, upload, and replay a
private clip; an unrelated account cannot access it; and the complete flow
works without enabling a paid plan or service.

### 3. Build project and script management

- Create projects, manage single-use invite codes, and add cast display names
  and highlight colors.
- Add script text and let the owner split it into, reorder, rename, and edit
  sections.
- Assign sections and show assignment colors consistently in both the
  project-wide script and each member's view.
- Add database constraints and backend policies for owner-only project edits
  and member-only project access.

**Exit check:** the owner can prepare a script and each cast member sees only
the projects and sections they are authorized to access.

### 4. Add recordings and progress

- Build a cast view filtered to the signed-in member's assigned sections.
- Request microphone permission only when the person starts recording.
- Support start, stop, playback, save, and redo; show clear recording and upload
  states and keep the previous take until a replacement has uploaded
  successfully.
- Store clips in private storage and save their metadata in the database.
- Show section progress and project-wide counts, with a playable list of
  current takes for authorized members.
- Allow the owner to delete a section or take and ensure its stored audio is
  also removed.

**Exit check:** recordings survive reloads and can be played by authorized
project members; failed uploads do not falsely show a section as done or erase
the previous take.

### 5. Add backing tracks and polish the PWA

- Let the owner upload, replace, and remove an optional backing track.
- Play the track while recording, with a clear headphone recommendation and
  controls for replaying or restarting it. Save the mic track separately in
  the first release.
- Add install metadata, app icons, a service worker for the app shell, and
  install guidance. Do not cache private scripts or audio in the service
  worker.
- Make online/offline and upload status visible. Explain that recording and
  syncing require a connection.
- Add responsive layouts, keyboard-accessible controls, and clear permission
  and error messages.

**Exit check:** the app can be installed, its interface opens after a prior
load, and it does not imply that private content or recordings are available
offline.

### 6. Pilot, review, and publish

- Run a small rehearsal with the owner and several cast members on their own
  phones.
- Check assignment accuracy, recording usability, status updates, sharing
  boundaries, deletion, and backing-track behavior.
- Fix issues found in the pilot; add a concise help page covering joining,
  recording, re-recording, and privacy.
- Verify the static deployment and backend production settings before sharing
  the app URL.

## Key risks and mitigations

- **Mobile browser differences:** validate recording formats and playback on
  real iOS and Android devices before choosing a storage format.
- **Private voice and script data:** require authenticated project membership;
  use private storage and backend access policies, not obscurity of URLs.
- **Upload failures or large files:** show progress and failures, preserve the
  prior take until replacement succeeds, and set reasonable recording limits.
- **Backing-track bleed:** recommend headphones and save microphone audio
  separately; mixing can be a later feature.
- **Offline expectations:** provide an installable shell, but explicitly
  communicate that project data and recording uploads need a connection.
- **Cost and retention:** monitor storage usage and define deletion/retention
  behavior before inviting a larger group. Stay on free plans, enforce upload
  caps, stop uploads when the app's configured storage budget is reached, and
  show provider quota failures clearly. Monitor egress in the provider
  dashboard; never auto-upgrade or route data to a paid fallback.
- **Free-tier availability and recovery:** Supabase Free projects can pause
  after inactivity and do not include paid-plan backups. Tell project owners
  about this limitation, verify a manual export and audio download, and do not
  promise continuous availability or managed recovery.

## Release checklist

- Owner can create a project, add script sections, invite cast, and assign parts.
- Cast can view their assignments and record, play, and redo their own takes.
- Owner and authorized cast can see progress and play current takes.
- Optional backing audio plays during recording without being silently mixed
  into the saved mic track.
- Unauthorized users cannot read scripts or access recordings.
- Permission denial, unsupported formats, and failed uploads are clearly shown.
- A failed redo leaves the existing take available.
- The PWA installs on supported phones and the deployed app is served over
  HTTPS.
- Project and recording deletion behavior is verified.
- The app uses only GitHub Pages/Actions and Supabase Free; no paid plan,
  custom domain, add-on, SMTP provider, or other metered service is enabled.
- Recording caps, quota/error behavior, and manual export/download have been
  tested, and users are told about free-tier pause and storage limitations.
