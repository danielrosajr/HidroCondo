# HidroCondo v0.8.0-beta

A mobile-first water-meter reading PWA for condominium managers and workers. Static HTML/CSS/JavaScript frontend with Supabase Auth, PostgreSQL, RLS and private Storage. User-facing copy and in-app walkthrough are in Portuguese. Engineering documentation, commits and releases are in English.

## What's new

**People & permissions:** A condominium owner can invite another **manager (`sindica`)** or a **worker (`zelador`)** to an existing condominium. Other condominium managers can invite workers, but cannot grant or revoke management privileges. Invitation links are single-use and expire after **24 hours for managers** and **7 days for workers**.

An invited person can sign in using an existing HidroCondo account or register a personal account. **They must not create a second condominium.** One personal account can now have different membership roles at different condominiums; access is determined by `memberships.role`, not just the global onboarding `account_profiles.account_type`.

The settings page lists actual members and their condominium-level roles, and shows pending invitations. A condominium owner cannot be removed. The owner can revoke access from other managers and workers; delegated managers can only remove workers. All changes are enforced in **server-side PostgreSQL SECURITY DEFINER RPCs**, not just by hiding controls.

**Important security properties:**

- Invitations confer the specified membership role only; they **never** transfer ownership.
- A manager link is sensitive: **any permanent, eligible account holding the link can accept it once**. Share it privately with the intended recipient; use the 24-hour expiry and revoke immediately if forwarded or exposed. Future optional email-binding or manual owner approval would strengthen this model for large deployments.
- Only a condominium owner can generate manager invitations; a delegated manager can generate worker invitations.
- Only the owner can remove another manager; no invitation or removal flow can revoke the condominium owner's access.
- Revoking membership does **not** delete the member's account, reading history, photographs or audit trail; it removes their access to the condominium.
- Invitation tokens use a **high-entropy random value**, with only a SHA-256 hash retained by the database. The raw link is shown only at creation. If lost, revoke the unused invitation and generate a new one. Invitation list contains **metadata, never secrets**.
- Anonymous demo visitors and support-only accounts cannot redeem a permanent membership invitation. Demo data and production memberships remain isolated.
- All existing `hc_create_worker_invite` / `hc_redeem_worker_invite` links from earlier releases remain supported until their original expiry (new links use the generic member invitation RPC).

## Installation / upgrade from v0.7.0-beta

> **Do not execute `sql/setup.sql` on an existing Supabase project.** Do not replace your working `config.js` or upload secret/service-role keys to GitHub Pages.

1. Back up the Supabase PostgreSQL database **and** the `hidrocondo-fotos` Storage files. Storage binaries are separate from PostgreSQL backups.
2. Confirm SQL migrations `upgrade_0_2_0.sql` through `upgrade_0_7_0.sql` have already been applied to this project, in order.
3. In **Supabase → SQL Editor**, run `sql/upgrade_0_8_0.sql` once, preferably on a staging database first. It adds one invitation table and five secure RPCs, with no dropped condominium, membership, reading, photo or demo data.
4. On the GitHub Pages publishing branch (usually `main`), **replace** `app.js`, `index.html`, `styles.css`, `sw.js`, `tour.js`, `package.json`, `README.md`, `RELEASE_NOTES.md`; **add** `people.js`, `tests/people.test.js`, `sql/upgrade_0_8_0.sql`.
5. Preserve other existing files, including `config.js` (deployment-specific), `config.example.js`, previous SQL migrations, `demo.js`, `photos.js`, `historical.js`, existing tests and icons.
6. Commit and wait for GitHub Pages. Reload the installed PWA (the service worker cache version is now `hidrocondo-shell-v0.8.0`).
7. Sign in as the **actual owner** of a test condominium, open **Ajustes → Pessoas e permissões**, and perform the acceptance tests below.

This ZIP contains the complete v0.8.0 source tree **except `config.js`**. Extract and upload its **contents** to the repository root. Do not upload the containing folder as a nested directory.

## Using the new feature

1. Open your existing condominium (for example, **Saint Bernard**) with its owner account.
2. Go to **Ajustes → Pessoas e permissões**.
3. Select **Síndico(a)** or **Zelador(a)** and generate the link. Management links ask for an explicit confirmation.
4. Copy the link **immediately** and send it privately. The original token cannot be retrieved from the server later.
5. The recipient opens the link and signs in or creates a personal account. Email confirmation may be required, depending on Supabase Auth settings. The pending link is retained in that browser so they can redeem it after confirming.
6. The recipient clicks **Ativar meu acesso**. Their new workspace appears with the invitation's scoped role, and existing readings become visible according to that role.
7. As a manager, return to **Pessoas com acesso** to review and remove users or revoke unused links. **No readings are deleted when membership is removed.**

### Notes on existing accounts

- Existing account profile `sindico` can join another condominium as `zelador` via link.
- Existing account profile `zelador` can join a condominium as `sindica` via a manager link from that condominium's owner. They gain scoped manager privileges **only in that condominium**, while their original global account profile stays unchanged.
- Support accounts remain on the separate temporary support-grant path.
- The account profile field still governs whether the person can **create entirely new** condominiums; it does **not** override an existing condominium membership role.

## Acceptance testing checklist (required before inviting real customers)

Use a test condominium and two or three distinct test accounts (owner/manager/worker). Never test by removing your production owner's own access.

1. **Owner:** Invite one manager. Verify the link expires after 24 hours; recipient joins without creating another condominium and sees the same existing readings.
2. **Worker:** Invite one worker. Verify the link expires after seven days; recipient can record but cannot see manager-only settings.
3. **Multiple roles:** A `zelador`-profile account can become `sindica` of another condo. Switching workspaces should use the per-condo role and preserve data isolation.
4. **Management restrictions:** A delegated manager cannot generate another manager link or remove another manager. They **can** invite/remove workers. Even direct RPC calls with a modified payload should be rejected.
5. **Owner safety:** The owner cannot be removed, by another manager or by their own RPC invocation.
6. **One-time links:** Redeem once; second redemption fails. Revoke a different unused invitation; redeeming it subsequently fails.
7. **No data loss:** Remove a worker from a condo; their original readings, photos and audit records remain. Their account should still work in other condominiums.
8. **Onboarding:** Open a link on a phone without being logged in, sign up and confirm email, then return to the app and accept the saved invitation (same browser). Verify **Descartar convite** works.
9. **Demo isolation:** An anonymous demo account cannot redeem permanent invitation or list real people.
10. **Mobile:** Test Android and iPhone at narrow widths (320–390 px); invite copy, list, revoke confirmation and guided tutorial must be usable by touch.
11. **Regression:** Verify demo environments, support grants, regular readings, photo upload, historical approval, dark mode, PDF and WhatsApp export still work.

The local `npm test` suite covers JavaScript calculations, parsing and **client-side UI role affordances**. It does **not** verify Supabase RLS, RPCs, Auth, or the real smartphone/browser integrations. Test the SQL migration in a separate Supabase project before production deployment.

## Operational and privacy notes

The membership screen intentionally displays a member's email to authorized condominium managers. Share this access only with people legitimately managing the condominium and maintain appropriate privacy notices. Secrets must never be printed in URLs or logged to external analytics; the HTML already sets `referrer` to `no-referrer`. For production sales, consider requiring the intended recipient's email or owner's explicit approval before activating a manager invitation.

## GitHub release information

- Commit: `feat: add scoped condominium invitations and member management`
- Tag: `v0.8.0-beta`
- Release title: `HidroCondo v0.8.0-beta — Condominium Invitations & Access Management`
- Pre-release: **Yes**, until Supabase and mobile integration tests pass.
