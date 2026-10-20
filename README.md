# HidroCondo v0.6.0-beta

Mobile-first water-meter tracking PWA for condominiums. The application is written in Brazilian Portuguese, with engineering documentation and releases in English. Stack: static HTML/CSS/JavaScript, Supabase Auth/PostgreSQL RLS/Storage.

## What's new: **invitation-only, no-signup demonstrations**

A specifically authorized platform support account can create a **fictional demonstration workspace**. Each workspace contains 12 weeks of seeded, clearly labeled sample readings and produces two distinct invitation URLs:

- **Manager demo**: dashboards, charts, consumption summary, history, approval/rejection of workers' historical submissions, manual readings, CSV and print-to-PDF.
- **Worker demo**: short reading-registration flow, locally previewed camera/gallery photos (never uploaded), historical submissions for approval, history.

Invitees open the link, read a large **TEST ONLY / FICTIONAL / DISPOSABLE DATA** warning, confirm it, then start using Supabase Anonymous Sign-In. No email or password is required. Both roles in the same demonstration workspace see shared *fictional* reading data synchronized online.

### Disposable by design

**Never use real readings, personal information, real condominium names, or confidential photographs in a demo.**

- Sample readings are fake. Additional demonstration readings and review requests **are saved temporarily in separate PostgreSQL tables** so the two visitors can test the workflow; they are **not** copied to production tables or into a new paid account.
- Camera/gallery photos are **displayed only as a temporary in-browser preview**. They are not stored, shared with managers or included in demo reports. Real HidroCondo continues to support saved photos; this feature is deliberately reduced in demo mode.
- Browser storage/session loss, signing out, changing devices or running out of invitation uses can permanently cut off a visitor's access. **No data recovery is promised.**
- Every demo expires server-side at 24 hours, 72 hours, or 7 days. The creator may revoke earlier. Tables are opportunistically purged once a new demo is created, if they expired **more than seven days earlier**; expiration stops all access immediately, but is not the same as immediate physical deletion.
- An admin may generate **up to 20 active workspaces**, with an individual 1/3/5-person limit for each role. Invite tokens are returned **once**, and only their hashes are stored.
- The manager and worker should use **different devices or separate private browser windows** when testing in parallel, because a signed-in identity cannot hold two different demo roles within the same workspace.

## Required deployment steps for v0.5.0 → v0.6.0

1. **Back up** the production PostgreSQL database and private Storage photos. Make a staging copy if you can. Do not run old `setup.sql` again.
2. In **Supabase → SQL Editor**, execute **`sql/upgrade_0_6_0.sql`**, after migrations 0.2.0 through 0.5.0. The new migration keeps existing production condominiums, readings, user memberships and photographs. It also strengthens production-membership helper functions and production worker-invitation redemption so anonymous demo users are refused.
3. In **Supabase → Authentication → Providers / Sign-In Methods**, turn on **Anonymous Sign-Ins**. Supabase considers anonymous Auth users `authenticated` at the Postgres level, hence the strict separation in the SQL migration. **Do not enable anonymous sign-ins before the 0.6 RLS hardening has been applied and reviewed**.
4. Upload files to your GitHub Pages deployment branch: replace `app.js`, `index.html`, `styles.css`, `sw.js`, `package.json`, `README.md`, `RELEASE_NOTES.md`; add `demo.js`, `sql/upgrade_0_6_0.sql`, `tests/demo.test.js`. Keep all other code, historic migrations, icons, and **your current configured `config.js` unchanged**. Never expose a secret/service-role key in a static site.
5. Wait for Pages deployment, force-refresh or close/reopen the installed PWA. The new service worker shell version is `v0.6.0`.
6. Sign in with a **platform support account** whose `account_type='suporte'` and `can_create_condominiums=true`. Open **🧪 Demonstrações** on the condominium picker or in the account header; create a fictional workspace, choose 24h/72h/7d and 1/3/5 persons per role, and copy **both** links immediately.
7. Test the **manager link in browser A** and **worker link in browser B / incognito**. No signup is needed. Check that the worker submits a historical batch and manager approves it, then verify the fictional shared chart updates. Also test revocation and expiry.

### How to authorize an existing platform support account

Run this in a *trusted* Supabase SQL Editor, replacing the email with the actual support account email. Do **not** grant this flag to ordinary accounts or visitors.

```sql
SELECT u.email, p.account_type, p.can_create_condominiums
FROM auth.users AS u
JOIN public.account_profiles AS p ON p.user_id=u.id
WHERE lower(u.email) = lower('YOUR_SUPPORT_EMAIL@EXAMPLE.COM');

-- Only if the account is already account_type='suporte':
UPDATE public.account_profiles p
SET can_create_condominiums=true
FROM auth.users u
WHERE u.id=p.user_id
  AND lower(u.email)=lower('YOUR_SUPPORT_EMAIL@EXAMPLE.COM')
  AND p.account_type='suporte'
RETURNING u.email,p.account_type,p.can_create_condominiums;
```

A normal `sindico` account is **not** a platform demo creator. The capability flag only authorizes creating demo spaces or new owned condos, not unrestricted entry into real client condos.

### Abuse protection before broader public rollout

Anonymous signup produces actual Supabase Auth rows and uses the `authenticated` PostgreSQL role. Existing production functions/policies must be audited whenever you add more features. Demonstration entry uses hard-to-guess, revocable, time-limited links, server-verified membership/role/expiry, limited rooms and capped records. These are **not** substitutes for CAPTCHA and broader abuse controls at scale.

For public marketing campaigns, add a proper **Cloudflare Turnstile / hCaptcha integration** that passes its token to `signInAnonymously`, rate limiting, monitoring and operational cleanup of anonymous Auth users. **Do not simply turn on the project's global CAPTCHA requirement without implementing the associated client token flow**; that would break the current login paths. Read [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous) and [CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha).

The demo is **not an alternative to a real billing trial**. Real tenants, subscriptions, trial conversion and production data migration are outside the scope of 0.6.0.

## SQL and isolation overview

The migration creates `hc_demo_spaces`, `hc_demo_invites`, `hc_demo_members`, `hc_demo_readings`, `hc_demo_submissions` with RLS enabled and **no direct browser table grants**. All demonstration actions use scoped `SECURITY DEFINER` RPCs:

- `hc_demo_create`, `hc_demo_list`, `hc_demo_revoke`: platform support creator only (revocation only by owner).
- `hc_demo_redeem`: 256-bit-class random token (two v4 UUIDs), hashed at rest, atomic usage-count check, role binding, server-side expiry.
- `hc_demo_snapshot`: returns only rows belonging to the member's active demo space; worker sees only own proposals.
- `hc_demo_add_reading`, `hc_demo_manager_history`: validated chronological insert (atomic for batch), limited max rows.
- `hc_demo_submit_history`: worker-only pending proposal.
- `hc_demo_review_history`: manager-only approval/rejection, atomic insertion, chronological conflict rejection.

Existing production membership helpers and invite redemption reject `is_anonymous=true` identities. Production RLS remains enabled. Demo no-photo behavior does not change the existing production photo policy.

## Testing and limitations

Run `npm test` (Node.js) for calculation and input tests; syntax-check with `node --check app.js` and `node --check demo.js`. Automated tests do **not** replace live RLS tests. Before using with external invitees, use a staging Supabase project to verify:

- An anonymous demo session **cannot read, update, create or join a real condominium**, even if it has a leaked legacy invite code.
- A manager's demo link cannot read other demo spaces or production readings.
- The worker cannot approve historical proposals or create a new demo space.
- Links expire/revoke even with the browser left open, after the next request (client polls while visible).
- Manager and worker views work on a 360-390 px Android device and on Safari/iPhone.
- Existing real users continue to sign in and store their photos normally.

**Not verified here:** execution of SQL in your actual Supabase, live cross-device sign-in, browser interactions on your phone, real CAPTCHA, production RLS behavior. No user data was modified while building the package. Always test on disposable data before sharing links.

## GitHub

- Commit: `feat: add isolated no-signup demo workspaces with expiring invites`
- Tag: `v0.6.0-beta`
- Release title: `HidroCondo v0.6.0-beta — Invitation-Only Demo Workspaces`
- Mark as **Pre-release**. Tag only after deploying the updated commit.
