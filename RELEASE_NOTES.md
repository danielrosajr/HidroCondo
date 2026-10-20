# HidroCondo v0.6.0-beta — Invitation-Only Demo Workspaces

## Features

- Add no-signup, role-specific demo links powered by Supabase anonymous sign-in.
- Create 24-hour, 72-hour, or 7-day fictional workspaces with predefined sample readings.
- Issue separate manager and worker demo invitations (one, three or five visitors per role).
- Show a mandatory full-size pre-entry warning and a prominent persistent demo banner.
- Let workers register fictional readings and submit historical data for a demo manager's approval.
- Synchronize fictional readings between demo participants without mixing them with production data.
- Display fictitious consumption charts and summaries, and allow demo CSV/print reports.
- Keep camera/gallery photos as **local-only previews**, never uploading them in demo mode.
- Enforce demo roles, expiration, revocation, limited uses, and monotonic meter values in Postgres RPCs.
- Add administrator-side demo list and early-revoke action.
- Update Portuguese tutorials, technical documentation and test coverage.

## Security and scope

- New segregated `hc_demo_*` tables with RLS and no direct client grants.
- Harden real-condominium membership helpers and worker invitation redemption against anonymous identities.
- Demo records are temporarily persisted for interaction, but are **disposable**. They do not convert into permanent condominium records.
- Anonymous sign-in must be enabled **only after applying migration `sql/upgrade_0_6_0.sql`**.
- Bot/CAPTCHA hardening and production acceptance testing are required before mass public use.

## Upgrade notes

Back up first. Apply `sql/upgrade_0_6_0.sql` after the v0.5.0 migration, then enable Anonymous Sign-Ins. Replace the web app files and add `demo.js`. Preserve `config.js`. This release is in beta; no live database or client-device integration tests have been performed here.
