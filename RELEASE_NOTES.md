# HidroCondo v0.5.0-beta — Photo Upload & Historical Attachments

This update improves photo upload on mobile, reduces Supabase Storage usage and enables optional image evidence for imported historical readings.

## New features

- Choose a photo from the **camera or gallery** for current meter readings.
- Add an **optional photo for each historical measurement** during the import preview. Historical entries without images remain supported.
- Automatically optimize images to WebP before upload, preserving aspect ratio and using adaptive quality/resolution to help keep meter digits legible.
- Display attached historical photos in the manager approval queue and carry them into approved readings and PDF reports.
- Updated the in-app tutorial for both managers and workers.

## Security and compatibility

- New `sql/upgrade_0_5_0.sql` migration updates the RLS policy and verifies worker-owned photo paths in historical submission and approval RPCs. Approval remains atomic.
- All existing data and photographs are preserved; do not rerun `setup.sql`.
- Keep your existing Supabase `config.js`; no secret keys belong in the public repository.
- Photography, Storage permissions and PDF export still require end-to-end tests on the actual Supabase project and mobile devices.

**Status:** Beta / testing required.
