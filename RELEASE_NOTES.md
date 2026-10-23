# HidroCondo v0.9.0-beta — One-Link Quick Demo & Role Switching

## Added
- **Single-link quick demo**: share `?demo-rapida=1` to let anyone try immediately without an account or anonymous Supabase sign-in.
- **Switch roles instantly** within the same browser between worker and manager views.
- **Complete fictional walkthrough**: capture test readings, submit histories as worker, review as manager, see charts and consumption thresholds.
- **Public demo entry** from the login screen and a copy-link action in the support admin demo panel.
- Updated Portuguese guided tour, mobile labels and prominent warnings.

## Reliability and privacy
- Quick Demo performs no Supabase Auth, Database or Storage requests. It cannot trigger anonymous sign-in limits.
- Each device has a fully independent in-memory simulation. No data sync; data resets on reload, exit or browser tab close.
- Existing collaborative, expiring demo links remain available as a separate legacy/advanced option.
- No database migration, real account permission change or photo storage changes.

## Install
Replace `app.js`, `demo.js`, `index.html`, `styles.css`, `sw.js`, `tour.js`, `package.json` and docs; add `quick-demo.js` and `tests/quick-demo.test.js` on your deploy branch. Preserve `config.js`, existing SQL migrations and user data. **No SQL to run.**

## Status
Beta. JavaScript tests pass. Mobile cross-browser acceptance testing is still required.
