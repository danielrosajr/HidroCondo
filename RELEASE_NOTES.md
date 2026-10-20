# HidroCondo v0.7.0-beta — Demo Links, Weekly Limits & Guided Tours

## What's new

- **Recover demo links:** authorized platform support can reopen manager/worker links on active demonstration workspaces. Pre-v0.7 links cannot be recovered (they were hash-only); a confirmation flow offers secure regeneration with old links invalidated.
- **Configurable meter consumption reference:** condominium managers can set a non-mandatory weekly threshold (m³ per 7 days) per real meter. The dashboard, WhatsApp report and PDF distinguish interval consumption from normalized weekly comparisons. Not a leak diagnosis or a legal limit.
- **Demo comparison:** a fictional weekly reference starts at 80 m³ and can be edited by the demo manager, without impacting real data.
- **Guided product tours:** spotlight walkthroughs tailored to managers, workers, support administrators and the two demo roles, optimized for mobile.
- **Improved navigation persistence:** normal Supabase token refreshes no longer reset the app screen; active tabs and the support demonstration manager are restored after a same-tab page reload where possible.
- **Tutorial and engineering documentation updated.**

## Required deployment

Run `sql/upgrade_0_7_0.sql` once in Supabase SQL Editor **after** the v0.6.0 schema, then publish the updated static files. Keep your existing `config.js`; no production data is intentionally deleted. See README for exact files and acceptance steps.

## Validation

Automated JavaScript tests cover weekly normalization, edge cases, existing readings, imports and tour configuration. Manual mobile visual checks, database/RLS tests, and full invite-recovery tests against Supabase remain required before production use.

**Status:** Beta / Pre-release.
