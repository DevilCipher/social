# Heart Social — shared workspace edition (v0.2)

A Vercel-ready publishing studio for **untenanted_heart**, with individual logins and one shared set of social accounts.

## What changed

- Email-and-password login for each member; no shared application password.
- Owner, Admin, Editor and Viewer permissions checked by the server on every request.
- Social account assignments for Editors and Viewers. Owners/Admins access all workspace accounts.
- Team screen to invite members, change roles/assignments, disable access, and create password recovery links.
- One-time invitation links: members choose their own password. Links expire in 7 days and are copied manually; no emails are sent.
- Editors create drafts and submit them for approval. Owners/Admins review, publish, schedule, or return posts to draft.
- Activity log records who changed access, submitted posts, approved publishing, and completed dispatch.
- Database-backed sessions are revoked on access changes, disabling a member, password changes, and password recovery.
- Revision checking prevents stale saves from overwriting another member's changes.
- Explicit API folders replace the old `[...route]` catch-all. There are **no square brackets or ellipses in any folder names**.

## Permission matrix

| Action | Owner | Admin | Editor | Viewer |
|---|---|---|---|---|
| View posts | All | All | Assigned accounts | Assigned accounts |
| Read shared media library | Yes | Yes | Yes | Yes |
| Upload media | Yes | Yes | Yes | No |
| Create drafts | Yes | Yes | Assigned accounts | No |
| Edit drafts | All | All | Own drafts | No |
| Submit for approval | Yes | Yes | Own drafts | No |
| Review / return to draft | Yes | Yes | No | No |
| Publish / schedule / cancel schedule | Yes | Yes | No | No |
| View activity log | Yes | Yes | No | No |
| Invite/manage Editors and Viewers | Yes | Yes | No | No |
| Invite/manage Admins | Yes | No | No | No |
| Change or disable Owner | No through UI | No | No | No |
| Change own password | Yes | Yes | Yes | Yes |

**Account scope:** An Editor/Viewer can read a post only if all of that post's destination accounts are assigned to them. A post targeting both Instagram and Threads is hidden from a member assigned only Instagram. Account-free drafts are visible only to their author and managers. Editors cannot edit other members' drafts. Submitted posts are locked until a manager returns them to draft. The media library is shared with every signed-in member; media is not partitioned by social account.

**One workspace:** All team members reuse the same connected accounts. This is not a multi-client SaaS or a separate set of social accounts per user. The current integrations support one destination account per platform. Roles do not grant access to Vercel, Ayrshare, or API tokens: those are managed separately by the deployment administrator.

## Supported platforms

Instagram, Facebook Pages, Threads, X, LinkedIn, Pinterest, YouTube, Bluesky, Mastodon, Tumblr and Telegram. No TikTok.

Nine platforms use the optional external Ayrshare API; check its current plans and fees before subscribing. Mastodon and Tumblr have native adapters. Account connections are verified before a manager can publish. No account is connected by this source package, and no paid service is purchased.

## Local planning mode

Use Node.js 22 or later:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Without cloud variables, the app offers browser-local drafts, uploads, previews and planned calendar dates. It **does not provide multi-user authentication or automatic publishing in local mode**. Local records stay in that browser and origin. Export a backup before clearing browser storage. Local drafts are not automatically migrated to cloud mode.

## Fresh Vercel setup

1. Extract the ZIP into a new folder. Upload all extracted files and folders to a private GitHub repository so `package.json` is at its root. Include the entire `app`, `components`, `lib`, `migrations`, `scripts` and `tests` folders.
2. Import the repository in Vercel with the Next.js preset. Build: `npm run build`. Use a supported Node runtime >=22.
3. Create a Neon Postgres database. Run **schema.sql** once in the SQL editor (safe to rerun).
4. Set `DATABASE_URL`, `APP_URL` (exact production HTTPS origin), and `SESSION_SECRET` (at least 32 random characters) in Vercel. Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Do not share credentials in chat or commit real .env files.
5. In your local extracted project, copy `.env.example` to `.env.local` and enter your database connection. Run `npm run create-owner` in a terminal. It prompts for your name/email and a hidden password of 12–128 characters. It creates the first Owner once; it never replaces an existing Owner.
6. Create a Vercel Blob **public** store and set `BLOB_READ_WRITE_TOKEN` plus its exact `BLOB_HOSTNAME`. Post media is public by URL so social platforms can retrieve it. The dashboard's data API is protected, but uploaded media URLs are not private. Never upload confidential documents.
7. Configure platform credentials and your scheduler as described below. Redeploy after changing environment variables.
8. Open the app and sign in with the Owner email/password. Open **Team & access → Invite member**, enter a role and allowed accounts, and copy the private link to that person using your own communication channel.
9. The recipient opens the link and chooses their own password. Test their access and a single small live post before using a multi-platform schedule.

Public registration is not enabled. Invitation tokens are random, stored as hashes, and carried in URL fragments that the UI removes after opening. User passwords are salted scrypt hashes, never plaintext. Sessions are random opaque tokens stored as hashes, in HTTP-only SameSite cookies, with a 7-day expiry. No default credentials are shipped.

## Updating your earlier version

1. Back up the database and export any browser-local drafts.
2. Replace the old source with this package. **Delete the old `app/api/[...route]` folder** if it was uploaded previously; do not leave it alongside these explicit API routes.
3. For an existing v1 database, run `migrations/002-team-access.sql`. For a new database use `schema.sql`; you do not need both.
4. Remove `APP_PASSWORD` from Vercel: it is no longer used. Keep/set `DATABASE_URL`, `APP_URL` and `SESSION_SECRET`.
5. Run `npm run create-owner` once. It also assigns legacy posts and media to the new Owner. Legacy queued/scheduled posts are returned to **pending review** because they have no accountable approving user. Review them before scheduling again.
6. Redeploy. Old shared-password cookies no longer grant access. Each user must sign in individually.

If GitHub browser drag-and-drop still fails, use GitHub Desktop to copy this folder's contents into a cloned repository, commit and push. The API structure no longer uses bracketed folders, but that change cannot guarantee a fix for browser, connectivity, or GitHub upload errors.

## Team workflow

- **Owner:** Invites Admins, Editors and Viewers; manages every account and post. There is one protected Owner per workspace.
- **Admin:** Invites/manages Editors and Viewers only. Cannot elevate themselves, modify another Admin, or change the Owner.
- **Editor:** Uses Create post, saves drafts, and clicks Submit for approval. A manager opens the pending post, reviews/edits it, then clicks Publish now or Schedule. Editors have no API permission to bypass approval.
- **Viewer:** Reads accessible posts, calendar entries and shared media. There are no content mutation permissions.
- **Access change:** Saves take effect on subsequent requests and revoke all existing sessions/invitation links for that member. If the member has not accepted their invitation, generate a fresh link after changing their access.
- **Password reset:** A manager can generate a new private link for a member they manage. On redemption, it replaces the password and revokes all prior sessions. Owner recovery requires trusted database-administrator intervention; there is no public email-reset service.
- **Disabled member:** Cannot sign in, redeem invitations, upload, or access protected routes. Re-enabling requires a fresh login.
- **Queued posts:** At dispatch time the app verifies that the approving user remains an active Owner/Admin. Otherwise the post returns to pending review. A request already claimed and in flight cannot be recalled by changing a role.

## Connect social accounts once for the team

### Ayrshare (nine platforms)

Link accounts at https://app.ayrshare.com and set `AYRSHARE_API_KEY` in Vercel. This workspace uses your primary Ayrshare profile. Do not give that key to team members. Owners/Admins see setup controls in Heart Social, but connection authorization happens in Ayrshare; this package does not embed a white-label OAuth linking flow.

Instagram must meet professional-account requirements; Facebook destinations are Pages, YouTube needs a channel, and X may require additional API setup/fees. Add the Pinterest board ID when composing Pinterest posts. Check current eligibility and pricing before subscribing.

### Native Mastodon

Create an app in your Mastodon server's Preferences → Development with `read:accounts`, `write:media`, `write:statuses`. Set `MASTODON_URL` to the HTTPS server origin and `MASTODON_ACCESS_TOKEN` to the resulting user token. Images are limited to 10 MB in this adapter, subject to any lower server limits.

### Native Tumblr

Register an API application, complete OAuth2 authorization with write access, and obtain a token. Set `TUMBLR_BLOG` to the blog name without `.tumblr.com` and `TUMBLR_ACCESS_TOKEN` to the bearer token. Token acquisition/renewal is an external setup step. The adapter creates text/image posts in Neue Post Format.

## Scheduling

Times are stored in UTC and displayed as Asia/Kolkata (IST). Configure a scheduler to call:

`GET https://YOUR-APP/api/cron`

Every minute, with header `Authorization: Bearer YOUR_CRON_SECRET`. Set a random `CRON_SECRET`, and set `SCHEDULER_ENABLED=true` only after the recurring scheduler is active. The app processes one due post and reconciles up to two pending results per tick. It does not use a browser timer.

For a Vercel plan supporting minute-level cron, add the following `crons` property to the existing `vercel.json`, preserving its build settings:

```json
{"crons":[{"path":"/api/cron","schedule":"* * * * *"}]}
```

Vercel supplies its configured CRON_SECRET as the bearer header. Hobby does not provide minute-level cron; use a suitable plan or an external scheduler with a secret header. No recurring scheduler is created by this package.

Dispatch claims are atomic, preventing a second worker from repeating the same post. Interrupted sends are marked for review after ten minutes; check destination accounts before reposting. Automatic retries are not enabled. A schedule can only be cancelled before its worker claims it.

## Media and integration limits

JPG/PNG/WebP, one MP4, or an image carousel up to 10 images. Bluesky/Mastodon/Tumblr support text and images only in this version; Bluesky and Mastodon allow up to 4 images here. YouTube requires one video and a title; YouTube determines Short eligibility. Providers impose additional constraints. The app does not convert images into videos, resize, transcode, or add licensed music. Previews are approximate. Image descriptions reach native Mastodon/Tumblr adapters, not the Ayrshare adapter.

No analytics, inbox, automatic token refresh, email invitation delivery, or multiple workspaces are included. Live integrations, cloud storage, and database access require your own configured services. This source is not deployed to your Vercel account, and no social posts were made during development.

## Project structure

| Folder/file | Purpose |
|---|---|
| `app/page.js`, `app/globals.css` | Dashboard, composer, calendar and media UI |
| `components/AuthScreen.js` | Login and invitation acceptance |
| `components/TeamPanel.js` | Team roles, account assignments and activity log |
| `components/PasswordDialog.js` | Change own password |
| `app/api/config`, `login`, `logout`, `password` | Explicit authentication routes |
| `app/api/invitations/accept` | One-time invitation redemption |
| `app/api/team`, `audit` | Team administration and activity |
| `app/api/posts`, `posts/action` | Draft/review/publish and cancellation |
| `app/api/accounts`, `media`, `upload`, `cron` | Shared connections, files and scheduling |
| `lib/server/handlers.mjs` | Server-side permission enforcement and transactions |
| `lib/permissions.mjs` | Shared role/account policy |
| `lib/auth.js` | Password hashes and database sessions |
| `lib/providers.js`, `lib/dispatch.js` | Platform publishing and guarded dispatch |
| `schema.sql` | Fresh database setup |
| `migrations/002-team-access.sql` | Upgrade from the earlier version |
| `scripts/create-owner.mjs` | First Owner creation without public signup |
| `tests` | Validation plus PostgreSQL-backed access-control tests |
| `.env.example` | Configuration template, no credentials |

## Verification

`npm test` runs the original content checks plus integration tests using an embedded PostgreSQL engine (PGlite). These cover unauthenticated access, role enforcement, scoped account access, ownership, CSRF checks, invitations, session invalidation, concurrency guards, activity logs, upload denial, and scheduled-send authorization. `npm run build` verifies the production Next.js bundle. Social API calls are stubbed in automated tests: successful tests do not prove that live accounts have permissions or that provider integrations will publish.

## References

- https://nextjs.org/docs/app/guides/authentication
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://app.ayrshare.com/docs/apis/post/overview
- https://docs.joinmastodon.org/methods/statuses/
- https://github.com/tumblr/docs/blob/master/api.md
