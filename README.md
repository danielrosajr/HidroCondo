# HidroCondo v0.7.0-beta

Mobile-first Brazilian Portuguese condominium water-meter PWA, hosted as a static app with Supabase Auth/PostgreSQL RLS/private Storage. This version extends v0.6.0-beta without deleting any production reading, photograph, user, membership or demonstration workspace.

## Features in v0.7.0

### Reopen demonstration invitations

**Support administrators** with `account_type='suporte'` and `can_create_condominiums=true` can open **Demonstrações → Meus ambientes de demonstração → Ver links** to retrieve the manager and worker invitation URLs **after a reload, background/foreground transition, or return to the home screen**. A new owner-scoped Supabase RPC returns the tokens. Invitation tokens for newly generated demo spaces are stored server-side in the private `hc_demo_invites.recovery_token` column; all demo tables remain RLS-protected and inaccessible by direct browser SELECT.

**Existing v0.6 demonstration links cannot be recovered:** the earlier implementation saved *only a hash*. On an older space, **Ver links** offers a **confirmed regeneration**. Rotating invalidates unredeemed old links, but does not terminate visitor memberships already activated; the space expiration date does not change. A support user can only recover/rotate invitations for demonstration spaces they themselves created.

Bearer links confer temporary access to *fictional* data. Treat links as confidential, never post them publicly, and never use real readings or identifying personal information in demo workspaces. The demonstration disclaimer and sticky test-only banner remain in place. Guests cannot access production data and demo photos are never uploaded.

### Weekly consumption reference (not a legal/contractual threshold)

Each **real** meter has an optional `weekly_limit_m3` configured in **Ajustes → Referência de consumo** by the condominium manager. The comparison is purely indicative; **80 m³/7 days is an example, not a proven rule**. We do not enforce or guess a monthly utility tariff, and the calculation does not diagnose leaks.

Calculation for two cumulative readings:

- `consumption_m3 = current_reading_m3 - previous_reading_m3`
- `elapsed_days = days between the readings`
- `weekly_equivalent_m3 = consumption_m3 × 7 ÷ elapsed_days`
- `allowed_m3_for_period = configured_weekly_limit_m3 × elapsed_days ÷ 7`
- Alert **above** if the normalized weekly consumption exceeds the configured reference; otherwise **within**.

Examples with a reference of **80 m³/7 days**:

- 83 m³ in **7 days** → 83 m³/7 days → **above**.
- 83 m³ in **16 days** → 36.313 m³/7 days → **within**.

The text displays both original dates/duration and normalized comparison, plus a note that the result is not proof of leakage. The reference is included in the latest WhatsApp report image/text and the full PDF summaries. Previous analyses based on observed periods remain available.

Demo manager guests can adjust a separate **fictional 80 m³/7 days default** by using **Painel → Referência semanal de demonstração**. Only demo managers can change that setting; it does not affect production meters.

### Guided mobile-first tutorial

The **? Ajuda** action starts a spotlight-style interactive tour that darkens the screen and highlights relevant controls. Tours have **Próximo**, **Voltar**, **Pular tour**, Escape and arrow-key support. They cover manager, worker, support, demo-manager, demo-worker and demo-administration interfaces. The first run is triggered once for each role/version and may be reopened at any time. The tour never clicks a destructive action or submits data on behalf of the user. Text is in Brazilian Portuguese.

### Better foreground/background session behavior

- Supabase `TOKEN_REFRESHED`, `INITIAL_SESSION`, and `USER_UPDATED` no longer rebuild the screen; unchanged `SIGNED_IN` identities do not trigger a redundant bootstrap.
- The current production tab and demo tab are restored from `sessionStorage` when the browser actually reloads.
- Demo administration returns to the same screen after a reload when the support session is still valid.
- Previously accepted demo invites may resume in the same tab if the session is still valid and the original link remains valid. Anonymous guest sessions can still be lost if browser storage is removed or invitations expire/rotate.

## Upgrade from v0.6.0-beta

1. **Back up database AND private Storage photos**. Create a staging project if possible. Ensure `sql/upgrade_0_6_0.sql` has already been run; don't rerun `setup.sql` or older migrations.
2. In Supabase **SQL Editor**, execute **`sql/upgrade_0_7_0.sql` once**. It adds the per-meter limit, the demo invitation recovery field, the demo weekly limit, scoped server RPCs and RLS policy for managers to update their own meters. Existing old invites remain valid until you intentionally regenerate them.
3. On the GitHub Pages deployment branch, **replace** `app.js`, `demo.js`, `index.html`, `styles.css`, `sw.js`, `README.md`, `RELEASE_NOTES.md`, `package.json` and **add** `limits.js`, `tour.js`, `sql/upgrade_0_7_0.sql`, `tests/limits.test.js`, `tests/tour.test.js`.
4. **Keep `config.js` untouched.** The package intentionally contains `config.example.js` only; do not overwrite your configured connection. Never place Supabase secret/service-role keys in client code.
5. Push the files to the branch used by Pages (usually `main`) without putting the entire project inside a new nested folder. Wait for the build, then hard refresh/reopen the PWA; the service worker cache is now `hidrocondo-shell-v0.7.0`.
6. Sign in as support, open **Demonstrações**, and verify **Ver links** on a newly created space, then reload the app and retrieve the same URLs. Test an older v0.6 space with the explicit **Regenerar** confirmation.
7. Sign in as an actual condominium manager and configure a limit for one meter. Record two **test** readings seven days apart (e.g., 3981 and 4064 → 83 m³), and inspect the reference comparison. Confirm that workers cannot modify reference limits.
8. Open **? Ajuda** on manager/worker/demo screens and test the guided tour on Android, iOS Safari and a desktop browser. Check that returning from WhatsApp or backgrounding the app does not reset the current tab.

## Security review / limitations

- **Tokens are recoverable for new demo invitations**, hence are sensitive secrets stored server-side in the RLS-protected demo invitation table. No `authenticated` or `anon` grants permit direct table access. The `hc_demo_links` and `hc_demo_rotate_links` RPCs enforce ownership and specifically authorized support credentials; a demo guest can neither retrieve nor rotate links.
- Rotating links revokes **unclaimed** invites, not existing demo memberships; revoke the entire demo workspace to end current visitors' access.
- Threshold UPDATE uses a policy requiring `is_condo_admin`, with a trigger disallowing modification of immutable meter identity. Frontend visibility is not a security boundary.
- This is still a beta. The Postgres migration and RLS enforcement must be tested **against a real staging Supabase instance** before production. JavaScript tests do not exercise Postgres policies or phone camera/WhatsApp integration.
- Browser visual automation was unavailable in the authoring sandbox; verify the spotlight geometry on small screens. Manual field/device acceptance testing is required.
- Demo anonymous sign-ins require abuse controls (e.g. verified CAPTCHA tokens) prior to broad public launch; do not relax existing RLS policies.
- **Do not claim that 80 m³ is the condominium's real limit** without confirming what duration, meter and consumption rules the manager actually means.

## Local tests

```bash
npm test
npm run dev
```

## Versioning / GitHub

- Commit: `feat: add recoverable demo links, weekly consumption thresholds and guided tours`
- Tag: `v0.7.0-beta`
- Release title: `HidroCondo v0.7.0-beta — Demo Links, Weekly Limits & Guided Tours`
- Mark as pre-release. Create the tag **after** the updated code and migration have been committed.
