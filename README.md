# HidroCondo v0.9.0-beta

Mobile-first condominium water-meter PWA using HTML/CSS/JavaScript, Supabase Auth, PostgreSQL RLS and private Storage. The user interface and guided tour are in Brazilian Portuguese; technical documentation is in English.

## New: shareable, no-signup Quick Demo

Open `https://YOUR-DEPLOYED-APP/?demo-rapida=1`.

- **One link for everyone.** The same URL can be opened by different visitors, including a worker and a condominium manager, with **no email, password, Supabase anonymous sign-in, or invitation limit**.
- **Role toggle:** instantly switch between *Ver como zelador(a)* and *Ver como síndico(a)* in the same browser. The toggle is only a fictional visual simulation; it does not grant any real account permissions.
- **Useful hands-on example:** twelve prefilled, fictional weekly readings; worker enters another fictional reading, sends a backdated history for approval; manager sees the results, approves/rejects the request, examines graphs, adjusts the weekly consumption reference, and exports a demo report.
- **Strict isolation:** all quick-demo state is stored exclusively in JavaScript memory in that browser tab. There are **no Supabase Auth/API/Storage operations** on the quick-demo route, and there is no access to real condominium data. Photos remain local previews only.
- **Disposable by design:** closing, leaving, or reloading the page resets the simulation. Visitors using the same link on different devices **do not share or synchronize their changes**. The quick link is public and has no expiration or revocation mechanism because it is not a capability to private/shared data.
- **Prominent warning:** visitors must acknowledge that readings and photos are fictional/disposable. The banner remains visible during the session; the guided tour has been updated for both roles.

### How to share

On the support admin account, navigate to **Demonstrações → Demonstração rápida → Copiar link único**. Alternatively share the direct Quick Demo URL once the new version has been deployed. A public **Experimentar demonstração rápida** entry is also available from the login screen.

### The old collaborative demo

The v0.6–v0.8 **collaborative** demo is retained as an advanced separate option. It can synchronize data between devices using Supabase and it uses expiring invitations with separate manager/worker roles. It still relies on **Supabase Anonymous Sign-Ins**. If this mode produces an anonymous-sign-in error, check the actual HTTP response and the **Supabase Authentication → Providers / Rate Limits** settings; do not assume a shared invite represents one shared user login. Anonymous sessions are device-specific. Quick Demo avoids this dependency entirely.

## Upgrade from v0.8.0-beta

**No database migration is required for v0.9.0.** Do not execute `setup.sql` or reapply old migrations.

1. Keep the Supabase project and original `config.js` unchanged. Take regular backups of real readings and Storage images before major deployments as general good practice; no real data is modified by this feature.
2. Extract `HidroCondo-v0.9.0-ATUALIZACAO.zip`.
3. **Replace** at repository root: `app.js`, `demo.js`, `index.html`, `styles.css`, `sw.js`, `tour.js`, `package.json`, `README.md`, `RELEASE_NOTES.md`.
4. **Add**: `quick-demo.js`, `tests/quick-demo.test.js`.
5. **Keep**: `config.js`, all previous `sql/` migration files, `math.js`, `analysis.js`, `limits.js`, `historical.js`, `photos.js`, `people.js`, `permissions.js`, icons and other existing files. The ZIP includes the full app baseline except the deployment-specific `config.js`, so replacing the entire code tree is also possible as long as you preserve that file and existing additional files.
6. Commit/push to the GitHub Pages source branch (typically `main`). The PWA service-worker cache version was bumped to `v0.9.0`. Reload or reopen the installed app after deploy.
7. Test the link on two devices. Each should enter independently with **no auth prompts**. On one device, submit a history as worker, switch to manager and approve it. Reopen the link to verify the session resets.

### Run tests locally

```bash
node --test tests/*.test.js
python3 -m http.server 8080
```

Visit `http://localhost:8080/?demo-rapida=1` for the Quick Demo or `/` for the configured regular application. The quick route also works without any Supabase configuration because it uses no backend calls. An internet connection may still be required to load the site's assets if they are not cached by the PWA.

## Technical architecture

- Regular condominiums: unchanged Supabase Auth/Database/Storage, RLS, permanent member invitations, audit and time-limited support access.
- Collaborative demo (legacy): unchanged server-side demo RPCs and anonymous Supabase user sessions. Its old links and permissions remain intact.
- New Quick Demo: `quick-demo.js` creates fictional readings and processes actions in memory; `demo.js` routes quick-demo actions locally. No SQL migrations or backend secrets are added.
- Data validations: duplicate dates, cumulative readings that decrease, future dates and invalid historical sequences are rejected locally, mimicking the real app's key safeguards.
- Privacy: the Quick Demo must never include actual condominium details, private photos, authentication tokens or real readings. Local role switching must never be re-used as a production authorization strategy.

## Known limitations / acceptance criteria

- A single quick link **does not synchronize changes across devices**. This is intentional: it removes anonymous sign-in and produces an instant zero-auth demonstration. For cross-device synchronized trials, a separate secured server design is necessary.
- The public quick link **does not expire**, but offers no access to any private data.
- Quick Demo reports explicitly label all numbers fictitious. Do not use them for real operations.
- Automated Node.js tests cover local calculations, sequencing, permission simulation and isolated data. A full visual E2E test could not be run in the restricted browser environment and needs confirmation on Android and iPhone before treating this beta as production-ready.

## GitHub release

- **Commit**: `feat: add single-link quick demo with local role switching`
- **Tag**: `v0.9.0-beta`
- **Release title**: `HidroCondo v0.9.0-beta — Single-Link Quick Demo & Role Switching`
- **Type**: Pre-release
