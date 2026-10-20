# HidroCondo v0.3.0-beta

## Added
- Manage multiple condominiums under one account with a quick workspace switcher.
- Worker view preview for managers and temporary support (read-only).
- Bulk import of historical meter readings without photos, with preview and chronological validation.
- Full PDF export of condominium readings, available photographs, and evidence-based trend summaries.

## Changed
- Removed experimental OCR for a simpler manual-reading workflow.
- Added database validation to prevent decreasing readings, including out-of-order historical inserts.
- Updated in-app tutorial, dark-mode-compatible navigation, and technical documentation.

## Upgrade requirements
- Back up your Supabase database and Storage.
- Run `sql/upgrade_0_3_0.sql` once **before** publishing the new application files.
- Preserve the existing `config.js`; do not re-run `sql/setup.sql`.

**Beta notice:** live Supabase access rules, full PDF/photo exports, and mobile sharing require field testing. See README.md for detailed test steps.
