# One source, GitHub delivery, offline use

Author only in `Desktop/Flight/Flight-Checklists`. FliteChek lives beside it under `Desktop/Flight/FliteChek`. Files are not renamed to IDs. A hidden `<!-- flitechek-id: 000123 -->` comment connects each Markdown document to `catalog.yaml` without cluttering its rendered view.

Keep IDs quoted and stable. Use `[]` for unrestricted applicability lists and `null` for empty optional fields. Copy a full entry from `CATALOG-ENTRY.yaml` in the source repository. IDs, fields and document matches are validated before publication and installation.

## Edit → commit → push

Push to `main`. The checked-in `.github/workflows/flitechek-library.yml` runs `.flitechek/build.mjs`, validates the files, and publishes **only generated JSON** on the `flitechek-library` branch. It never writes source edits back into `main`. Generated revisions advance automatically when content or metadata changes; you may still increase the authored revision yourself.

The app defaults to:

`https://raw.githubusercontent.com/marpa96/Flight-Checklists/flitechek-library/library.flitechek.json`

When its Menu is opened online, it quietly checks once per session and offers valid changes for review. **Import / update checklists → Check for library updates** performs an explicit check. Installation is deliberate and preserves current runs. During a checklist no background refresh changes its contents. Failures or no signal leave local data intact.

The workflow requires GitHub Actions enabled and repository Actions policy allowing its declared `contents: write` permission. A branch rule that blocks the generated branch may need adjustment. The workflow has not run until you push these local changes. Its Actions status shows success or a validation error. The previously published package remains if a build fails.

## File fallback

ZIP/JSON import remains available for private repositories or transferring files offline. A repository ZIP containing one `catalog.yaml` and tagged Markdown is supported; documentation/code examples are ignored. Installed checklists work without network access.

## Notes

- Aircraft/rules/tail metadata is stored and shown. Global flight-profile filtering remains a separate future feature.
- The catalog flags the existing C172S filename / C172R Applies-to discrepancy without altering procedural text.
- App-code updates are separate from library updates. This prototype still uses the Mac's local server for app-code updates; the installed app and library run offline.
- Retired duplicate sources are stored only as rollback archives in the app's private `.local` directory.
