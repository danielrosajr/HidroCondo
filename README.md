# HidroCondo v0.3.0-beta

HidroCondo is a Portuguese-language, mobile-first PWA for recording condominium water-meter readings. Stack: static HTML/CSS/ES modules on GitHub Pages, Supabase Auth/Postgres/Storage with RLS, plus client-side PDF reporting.

## Upgrade from v0.2.0-beta (existing installations)

**Back up your Supabase data and private Storage photos first. Prefer testing this migration in a disposable Supabase project before production. Do NOT re-run `sql/setup.sql`.**

1. Supabase → **SQL Editor → New query** → run **`sql/upgrade_0_3_0.sql`**. This migration preserves existing readings and memberships; it removes the single-condominium-per-user constraint, relaxes the manager creation rule, enables historical imports without photos, and validates monotonic readings inside Postgres.
2. Update the deployed files listed below on the GitHub Pages publishing branch (usually `main`). **Preserve your existing `config.js`** with only the Supabase URL and *publishable/anon* key. Do not add service-role or secret keys to GitHub.
3. Wait for GitHub Pages to deploy, then reload the PWA. The service-worker cache version is `v0.3.0`.
4. Test with disposable accounts/condominiums before importing the actual previous year of readings.

**If you still run v0.1.0**, execute `sql/upgrade_0_2_0.sql` before `sql/upgrade_0_3_0.sql`. For new installations, run `sql/setup.sql`, then the 0.2.0 migration, then the 0.3.0 migration, in that order. Do not execute `setup.sql` on an established project.

## Functional changes

### Multiple condominiums under one account

- Each account can be a member of multiple condominiums (`memberships` primary key remains `(condominium_id, user_id)`). Manager accounts may create more than one condominium, and worker accounts may redeem an invitation to an additional condominium.
- Use **Condomínios** at the top (or **Ajustes → Trocar de condomínio**) to return to the workspace selector; this does **not** revoke membership or log out. The active workspace is saved *locally, per logged-in user*; it is not a backend permission switch.
- All meter, readings, photos, invitations, support grants, and reports remain scoped by `condominium_id`; Supabase RLS enforces membership. Managers can manage multiple spaces with one email; workers can join multiple via separate invite links.
- A user’s **account type** remains fixed (`sindico`, `zelador`, `suporte`). This release supports multiple condominiums **within that type**, not being a manager in one and a worker in another on the same account. Mixed roles would require a separate future permissions redesign.

### Removed OCR

- All OCR/Tesseract UI, scripts, helper parsing and tests have been removed. Users enter the accumulated meter reading manually and confirm it. Do not use the instantaneous flow reading (`m³/h`).

### Worker-view preview

- **Ver como zelador(a)** is visible to managers and temporary support users. It temporarily hides manager tabs and presents the worker’s tabs/recording flow; **it is a read-only preview**: fields on the recording form are disabled and no permission is changed.
- **Voltar à administração** restores the previous management view. Support user previews remain subject to their authorization expiry.

### Historical import

- **Histórico antigo** supports a quick-add form (**date + reading → Add**) or bulk paste of *one date and reading per line*, without photos, for dates strictly before today:

```text
10/10/2025;3981,000
17/10/2025;4.064,959
24/10/2025;4.146,100
```

- Accepts `DD/MM/YYYY` or `YYYY-MM-DD`, semicolon, and Brazilian numeric format. Decimal separator is a comma; dots are thousand separators. It is limited to **250 readings per submission** (use more batches if needed).
- Preview the count, dates, sample values, and total difference **before** saving. Confirm to insert the batch in one atomic request. Each imported row is marked `entry_kind='historical'` and `photo_path=NULL`, clearly identified in history and PDF.
- Prevalidation prevents duplicate dates, future/today dates without photos, and decreases in the cumulative meter value relative to any existing previous or subsequent measurement. An additional Postgres trigger validates order on insertion/update (including direct API calls) and serializes concurrent changes per meter.
- Equal consecutive readings are allowed (zero consumption). **Real meter replacement/reset/rollover is not supported within the same meter history**: create a new meter record instead. Do not fabricate values to force a monotonic sequence.

### Full PDF export

- **Histórico → PDF completo** generates a **downloadable PDF for the active condominium**, grouped by meter, with all database readings (fetched in pages), date, full value, period consumption, registration notes and **photos where present**. Historical entries without photos are explicitly labeled.
- Each meter includes a limited evidence-based natural-language summary. Period-based totals are not claimed to represent full calendar months. Trend analysis is indicative and does not diagnose leaks.
- PDF generation requires network access to load `jsPDF` from CDN on first use and to download private photos while authenticated. A photo-access error aborts the export instead of silently omitting the evidence. Large photo-heavy reports may take time and use substantial memory; prefer exporting on desktop for very large histories.
- The PDF is generated in the browser; the service does not receive the completed PDF. Handle exports as private condominium documents.

### Tutorial upkeep

- Help is always accessible via **? Ajuda** and opens automatically once per role and version (`hc_tutorial_v030_*`). It now covers condominium switching, importing legacy data, the read-only preview and PDF export.
- **Every future release that changes the user workflow must update both the in-app tutorial and this README.** Technical documentation in English; end-user UI/tutorial in Brazilian Portuguese.

## Security and practical limitations

- Supabase Row Level Security is authoritative; hiding a button is never a sufficient permission check. Worker accounts cannot create condominiums or correct readings. Managers can only manage condominiums where they are admins. Temporary support authorization continues to be scoped and expirable.
- Client-side checks are for usability. Backend trigger validates sequential values, but **two readings on the same date are still forbidden**, and there is no rollover/reset workflow.
- Historically imported values **lack photographic evidence**, so the UI/PDF must never imply they were camera-verified.
- Exporting to PDF requires CDN network availability. Browser/PWA sharing limitations for WhatsApp remain unchanged: some devices cannot share a PNG and caption together.
- **Not tested against your live Supabase project or WhatsApp devices**. Automated tests cover historical parsing and calculations; database RLS and PDF photo completeness require real-environment testing.

## Files to update

Replace on the publishing branch: `index.html`, `app.js`, `math.js`, `styles.css`, `sw.js`, `README.md`, `manifest.webmanifest`, `package.json`, and `tests/math.test.js`.

Add: `historical.js`, `sql/upgrade_0_3_0.sql`, `tests/historical.test.js`.

Keep unchanged: `analysis.js`, `config.js` (**must preserve your real credentials**), `sql/setup.sql`, `sql/upgrade_0_2_0.sql`, icons, and existing analysis tests.

Remove: no files. OCR code was removed from existing files.

## Manual test checklist

1. Login as manager. Create condominium A, return to the selector, create condominium B. Switch between them and verify readings and settings do not cross over.
2. Login as worker in a separate browser. Redeem an invitation to A, then B, and switch without logging out. Verify no manager-only controls appear and API cannot create condominiums.
3. Manager clicks **Ver como zelador(a)**; verify the worker view appears but recording cannot be submitted; click **Voltar à administração**.
4. Import several 2025 readings with no photos. Verify order, preview, zero-consumption intervals, and that all rows appear as historical. Attempt impossible dates, duplicate dates and decreasing values; verify rejection.
5. Test the *same validations against the backend* (direct API/RLS as well as normal UI). Create a new meter to represent a real replacement/reset.
6. Export PDF with multiple meters and a mix of readings with/without photos. Confirm all rows and available photos appear. Test both small and large report sizes.
7. Confirm dark mode, onboarding, existing login, image reporting/WhatsApp, service-worker refresh and tutorial. Verify temporary support session expiry and revocation still work.

Run local tests: `npm test`. Serve locally: `npm run dev` and open `http://localhost:8080` (requires your own `config.js`).

## GitHub release

- **Tag:** `v0.3.0-beta`
- **Title:** `HidroCondo v0.3.0-beta — Multi-condominium, History Import & PDF Export`
- **Mark as pre-release** until real Supabase / mobile tests pass.
- **Commit:** `feat: support multiple condominiums, historical imports and PDF reports`
- Create the release **after committing the new source files** so the tag points to the correct revision.
