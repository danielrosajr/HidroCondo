# HidroCondo v0.5.0-beta

A mobile-first condominium water meter PWA, built with static HTML/CSS/JavaScript and Supabase PostgreSQL, Auth, RLS and private Storage. The in-app experience and help are written in Brazilian Portuguese. Technical docs and GitHub releases are in English.

## What's new

- **Current readings:** two clearly labeled options — **Take photo** (`capture="environment"`) and **Choose from gallery** (without `capture`). Both attach photo proof to the same measurement. A worker's current reading still requires a photograph; managers retain the existing first-reading exception.
- **Historical readings:** optional photograph **per date**, directly inside the confirmation preview, from the camera or gallery. This works for managers saving history and for workers submitting a batch for manager approval. Dates without photos remain valid.
- **Reduced image size:** before upload, photos are resized locally without upscaling and encoded to WebP. Processing starts at **2048 px maximum edge and quality 0.88**, with progressively smaller high-legibility options if the image exceeds a **~1.3 MB soft target**. The final image must remain **under the 5 MB Storage bucket limit**. The original photo is not overwritten on the phone. Pixel details, size and browser compatibility affect actual compression; no fixed savings can be promised. Original files above 30 MB are rejected.
- **Approval & exports:** photos attached to worker submissions remain private, visible to the manager reviewing the request, and are linked to the official reading after approval. Existing PDF and image reports include the associated images. Records without a photograph are explicitly identified.
- Updated the Portuguese in-app tutorial for these flows; workers still cannot approve their own submissions.

## Upgrade from v0.4.0-beta (in this order)

1. **Back up the existing Supabase database and Storage photos.** Run the migration on a test project first, if available.
2. Open **Supabase → SQL Editor** and execute `sql/upgrade_0_5_0.sql` **after** migrations `upgrade_0_2_0.sql`, `upgrade_0_3_0.sql` and `upgrade_0_4_0.sql`. This migration replaces the historical submission/review RPCs and the `reading_create` policy. **Do not execute `setup.sql` again.** No existing tables or photographs are deleted.
3. Update the static site files in the GitHub Pages deployment branch (typically `main`): **replace** `app.js`, `index.html`, `styles.css`, `sw.js`, `package.json`, `README.md`, `RELEASE_NOTES.md`; **add** `photos.js`, `sql/upgrade_0_5_0.sql`, `tests/photos.test.js`.
4. **Preserve your existing `config.js`** (with your project's public/publishable key and URL). This archive deliberately does not include your configured `config.js`. Do not upload any Supabase service-role/secret keys to the website.
5. Commit, wait for GitHub Pages, then **reload the PWA**. The service worker cache name changes to `hidrocondo-shell-v0.5.0` to refresh the static files. On some phones, close and reopen the installed app.

The archive contains the full application baseline, except your `config.js`; if you upload the archive's files, **keep directories in place** (`icons/`, `sql/`, `tests/`). The archive is not itself a GitHub Pages deployable ZIP unless you extract and upload its contents.

### Existing data and permissions

- No existing readings, memberships, invitations or photos are deleted by this migration.
- Current readings keep the existing worker-photo requirement and initial-manager-reading exception.
- Historical readings remain in chronological order and must not decrease across adjacent dates.
- Workers **submit** historical batches; they **cannot** insert approved historical readings directly. A manager must approve or reject each batch.
- Worker photo paths are validated by a SECURITY DEFINER RPC: only the logged-in worker's files inside the current condominium, in the `hidrocondo-fotos` bucket, may be attached. The RPC also checks that the objects exist. The manager approval RPC rechecks ownership/object existence before committing all readings atomically.
- Manager-entered historical photos have the same condominiums/auth UID prefix restriction in the `reading_create` RLS policy.
- Approved photos remain subject to the private Supabase Storage policies. A rejected batch retains its private photo references for audit; unused uploaded files may require a later retention/cleanup policy.
- If a historical batch fails to save after photo upload, the frontend attempts to delete the newly uploaded files. In rare network failures, orphaned Storage objects may remain and require administrative cleanup.

## Photo compatibility and performance

Modern Android Chrome and current iPhone Safari can generally pick photos from the gallery and use the camera. Some **HEIC/HEIF** images may not decode in older browsers; users can select or convert a JPG/PNG/WebP instead. WebP encoding depends on the browser; the app reports a clear error if unsupported. Compression happens locally; slow phones and very large photos can take several seconds. Always zoom into the preview to verify the digits are readable.

The app does **not** store the original uploaded photo (only the optimized WebP), and it does not run OCR. The private bucket's maximum accepted file size remains 5 MB; the migration does not increase costs or bucket limits. Loading historic pictures from the private bucket for PDF export uses network traffic.

## Manual acceptance checks

1. Login as a worker on Android/iPhone. Go to **Nova leitura → Tirar foto**, confirm a preview and save a reading; check that the photo displays in History.
2. Repeat with **Nova leitura → Escolher da galeria**. Ensure a canceled picker doesn't unexpectedly erase a previously chosen photo. Attempt saving without photo: workers must be blocked.
3. Open **Histórico antigo**, enter two dates, preview the batch. Attach a gallery image to only one date and leave the other without photo; verify both values and one thumbnail.
4. Submit as a worker. The manager must see **Ver foto** only on the photographed date; readings must not be included in official graphs until approval.
5. Approve the batch. Verify the picture appears on the correct historical reading and in PDF; the other entry is clearly marked without image.
6. Repeat a manager's direct historical import with one optional image. Try a declining reading and verify the entire batch is rejected atomically.
7. Test both light and dark mode, screen sizes 360 px–430 px, landscape photos, large gallery photos, and switching between condominiums without leaking selected photos to another condo.
8. Check that the app still works when a historical row is imported **without any photo** and that existing data is unchanged.

## Testing

`npm test` runs arithmetic, historical parsing, permission and image-scaling tests, including orientation-preserving dimensions and size constraints. `node --check app.js` and `node --check photos.js` verify JavaScript syntax. **Live Supabase migrations, RLS/Storage permissions, Android and iPhone camera/gallery interactions, WhatsApp and PDF integrations must be tested in the real deployment.** JavaScript unit tests do not validate those external dependencies.

## GitHub

- Commit: `feat: support gallery photos and optional historical attachments with compression`
- Tag: `v0.5.0-beta`
- Release title: `HidroCondo v0.5.0-beta — Photo Upload & Historical Attachments`
- Create a **pre-release** from the updated deployment branch **after committing the files**.
- No files need to be removed; preserve `config.js`.
