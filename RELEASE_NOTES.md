# HidroCondo v0.4.0-beta — Historical Approvals & Admin Permissions

## Added
- Worker-submitted historical water-meter readings now enter a manager approval queue instead of official history.
- Managers can review every submitted value, approve an entire batch atomically, or reject it with a reason.
- Workers can track pending, approved and rejected history batches, including rejection explanations.
- Explicit, optional platform-administrator capability for creating condominiums, enabled per support account in the Supabase SQL Editor.

## Fixed / Security
- Replaced the outdated condominium creation RLS policy while retaining owner and account-type checks.
- Workers cannot bypass historical approval by inserting no-photo historical rows directly through the API.
- Approval checks roles and meter sequence in PostgreSQL; pending/rejected rows never enter official statistics or PDF exports.

## UX
- Finger-friendly approval controls and expandable readings lists on mobile.
- Updated manager and worker in-app tutorials (Portuguese).

## Upgrade
1. Back up Supabase.
2. Run `sql/upgrade_0_4_0.sql` after earlier migrations.
3. Optionally grant the support account condominium-creation permission using the explicit SQL in README.
4. Replace deployed frontend files, keeping `config.js` unchanged.
5. Test both roles and the full review lifecycle before production.

**Status:** Beta — database migration and end-to-end Auth/RLS tests still require verification in a real Supabase project.
