# HidroCondo v0.4.0-beta

Mobile-first condominium water meter PWA, hosted on GitHub Pages with Supabase (Auth + PostgreSQL RLS + private Storage). User-facing app and tutorial are in Portuguese; engineering documentation and GitHub releases are in English.

## Upgrade from v0.3.0-beta

**Back up your Supabase database and Storage photos. Test in a non-production project first.** This version is an additive migration: no condominium, member, reading or image is deleted.

1. In Supabase **SQL Editor**, run **`sql/upgrade_0_4_0.sql`** once, after `upgrade_0_2_0.sql` and `upgrade_0_3_0.sql`. Do **not** re-run `setup.sql` on an existing project.
2. If you are the *platform support administrator* and need to create new condominiums, enable that explicitly for **your support account only**, following the SQL below. A regular `sindico` account does not need this grant.
3. Upload the updated application files to the branch from which GitHub Pages deploys (usually `main`). **Never replace your configured `config.js` or put a secret/service-role key on the website**.
4. Wait for Pages deployment and reload the PWA (service worker shell cache bumped to `v0.4.0`). Test with disposable condominiums and separate manager/worker accounts before importing real data.

## Diagnose the 403 when creating a condominium

The error `42501: new row violates row-level security policy for table "condominiums"` means the insert was rejected by **RLS**. It is unrelated to the separately logged `42P01` missing `supabase_migrations.schema_migrations` relation during a migration-version inspection.

Possible causes in v0.3:

- The account has `account_type='suporte'`. A support account is not automatically authorized to create condominiums.
- The Supabase database still has an older `condo_create` policy prohibiting creation when a manager already belongs to a condominium; the 0.4 migration replaces it.

**Inspect the profile of the affected account.** In Supabase SQL Editor (trusted administrative context), replace the sample email:

```sql
SELECT u.email, p.account_type, p.can_create_condominiums
FROM auth.users AS u
JOIN public.account_profiles AS p ON p.user_id = u.id
WHERE lower(u.email) = lower('YOUR-OWN-ACCOUNT@EXAMPLE.COM');
```

To grant the **platform support account** the narrow capability to create new condominiums (but not blanket access to existing ones), run the following **only after the 0.4 migration**. Replace the example email with your real support account's email:

```sql
UPDATE public.account_profiles AS p
SET can_create_condominiums = true
FROM auth.users AS u
WHERE p.user_id = u.id
  AND lower(u.email) = lower('YOUR-OWN-SUPPORT-EMAIL@EXAMPLE.COM')
  AND p.account_type = 'suporte'
RETURNING p.user_id, p.account_type, p.can_create_condominiums;
```

Confirm that **exactly one** row was returned. `0 rows` means the email or profile type did not match. Do NOT remove the `account_type` condition or bulk-grant this capability. The app's regular `authenticated` role has no UPDATE privilege or UPDATE RLS policy on `account_profiles`, so users cannot enable the flag from their browser.

For troubleshooting the policy deployed on the server:

```sql
SELECT policyname, cmd, roles, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'condominiums';
```

Onboarding-created condominiums belong to the creating account; the existing trigger creates a manager membership for that condominium. Platform support accounts still require time-limited consent to access *other* condominiums.

## New feature: historical data submitted for review

Workers can open **Histórico antigo**, paste the rows or add entries on mobile (date + reading), preview the list, and tap **Enviar para aprovação**. The submission is saved in `historical_submissions`, separate from the official `readings` table.

Managers open **Histórico antigo → Históricos aguardando aprovação**, inspect every entry, and **Aprovar** or **Rejeitar** (rejection requires a reason). On approval, every row is inserted atomically with the original worker attribution, with a historical/no-photo marker. The new rows then appear in the dashboard, PDF and WhatsApp reports. Rejected submissions are retained for audit and visible to the submitter along with the rejection reason.

Any duplicate date, decreasing cumulative value or conflicting measurement causes the approval to **fail atomically**; no partial import is published. The manager should reject the submission with an explanation, then the worker can create a corrected batch. The 0.3 sequence-validation trigger continues to enforce monotonic meter values on approval. Normal worker readings still require photo evidence.

**Security model:**
- The worker cannot directly INSERT a `historical` entry into the official `readings` table: the RLS policy now reserves that write path for condominium managers.
- The worker can only submit a batch for a condominium where they are a member with `role='zelador'`, enforced in an RPC.
- Only a manager with `is_condo_admin(condominium_id)` may approve or reject an entry. No `historical_submissions` INSERT, UPDATE or DELETE permissions are granted to frontend browser users. The RPCs validate identity and ownership server-side.
- A worker can read only their submitted batches; a manager can read all of the condominium's batches. Other condominiums remain isolated.
- Support users with temporary access can inspect official readings as before; they cannot review workers' batches.

## Mobile-first UX and tutorial

- Approval actions are arranged as finger-friendly buttons on narrow screens, with a collapsible list of submitted readings for verification.
- The **? Ajuda** tutorial is revised for both worker and manager. It is redisplayed once for this version and remains accessible any time.
- Future workflow changes must include corresponding in-app tutorial and README updates.

## Files to update

**Replace**: `app.js`, `index.html`, `styles.css`, `sw.js`, `package.json`, `README.md`, `RELEASE_NOTES.md`.

**Add**: `sql/upgrade_0_4_0.sql`, `permissions.js`, `tests/permissions.test.js`.

**Keep**: `config.js` with real public Supabase config, `sql/setup.sql`, previous upgrade SQLs, `math.js`, `analysis.js`, `historical.js`, icons, `manifest.webmanifest`, and existing tests. No file removals.

The ZIP includes the whole static app (except your private deployment-specific `config.js`) so you can use drag-and-drop upload. Maintain the top-level folder structure when uploading to GitHub.

## Manual acceptance tests

1. Confirm that existing managers can create a second condominium; workers cannot create one.
2. Confirm support accounts cannot create by default. Grant one designated support account permission using SQL; verify it can create a NEW condominium. Ensure that it cannot access arbitrary existing condominiums.
3. Login as worker on mobile: import two old readings without photos, preview, submit. Check the batch shows **Aguardando aprovação** and does NOT affect the official graph.
4. Login as manager: open **Histórico antigo**, inspect the whole batch, approve. Check all readings appear with original worker attribution and `Histórico sem foto` labels, including in exports.
5. Submit a second batch, reject it with a reason. Check the worker sees `Rejeitado` and the reason. Confirm it does not enter official readings.
6. Try impossible dates, a decreasing value, a duplicate date and two concurrent approvals; verify failed approvals are atomic and no partial rows appear.
7. Test condominium switching, worker-view preview, sign-out/in, dark mode and the in-app tutorial on small Android/iPhone screens.

**Limitations:** SQL migration, Supabase Auth/RLS and WhatsApp/PDF integration require real-project tests. The automated JavaScript tests only cover local calculations/parsing. No live user data was modified in preparing this release.

## GitHub

- Commit: `feat: add manager approval for historical readings and fix condo creation permissions`
- Tag: `v0.4.0-beta`
- Release title: `HidroCondo v0.4.0-beta — Historical Approvals & Admin Permissions`
- Mark as **pre-release**. Tag the release only after source files have been committed to the deployed branch.
