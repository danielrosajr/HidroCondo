# HidroCondo v0.8.0-beta — Condominium Invitations & Access Management

## New

- Invite additional **managers** and **workers** to an existing condominium with secure one-time links.
- Condominium owners can invite/remove managers; delegated managers can invite/remove workers only.
- Members can have **different roles in different condominiums** using one login.
- New **People & permissions** settings panel lists members and pending invitations.
- Revoke unused invitations and remove existing memberships without deleting readings or photo history.
- Onboarding prioritizes invitation acceptance rather than asking the recipient to create a new condominium; the link can be resumed after email confirmation in the same browser.
- Updated Portuguese in-app guided tour and mobile-friendly controls.

## Security

- Five server-side, permission-checked PostgreSQL RPCs and RLS-protected invitation metadata.
- High-entropy, single-use tokens stored as SHA-256 digests only.
- 24-hour expiration for manager links and 7-day expiration for worker links.
- Owner access cannot be removed; no invitation transfers ownership.
- Demo anonymous sessions and support-only accounts cannot redeem real membership invitations.

## Upgrade

Run `sql/upgrade_0_8_0.sql` after all previous migrations; then deploy the updated static site. **Do not replace configured `config.js` or rerun `setup.sql`**. No existing data is intentionally deleted.

## Known beta limitations

Management links are bearer tokens; anyone who obtains an unused link may accept it with an eligible account. Treat links as sensitive, share them privately and revoke if exposed. Raw links cannot be recovered after leaving the invitation creation screen (only pending metadata remains).

JavaScript unit tests passed locally; real Supabase RLS/RPC integration and smartphone tests remain required before production use.
