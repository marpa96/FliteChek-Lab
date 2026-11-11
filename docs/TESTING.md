# Web-app verification

## Automated engine checks

`npm test` runs 31 checks covering Markdown parsing, fenced examples, warnings/tables, lossless item edits, nested reorder, section boundaries, pending progression, reversible checks, empty drafts, independent variant state, emergency return, revision isolation, restoration, restart, next procedure, backup validation and the ten bundled sources.

Six launcher access-control checks also pass: remote requests require a private link or session cookie; incorrect keys are rejected; local preview remains available.

## Browser checks

`tests/browser.mjs` drives a separate Chrome debugging profile at a 390 × 844 viewport. It clears data for its test origin, so it must never point at your real installation or normal browser profile.

Checks cover horizontal layout, immediate check persistence, quota-failure handling, pending state, reload recovery, emergency free scrolling and return, draft preservation, revision creation and restoration, normal countdown scrolling, offline reload and interaction, Markdown import with inert HTML, and full backup restoration. Screenshots are saved to `test-output/` by the test runner.

For developers who have started a throwaway Chrome profile on debugging port 9227 and served `web/` locally on port 8088:

```sh
node tests/browser.mjs
```

The test is not a mobile Safari test. The local HTTPS certificate validates cryptographically on the Mac, but installing and trusting it on a physical iPhone remains untested.

## First iPhone acceptance test

1. Complete `IPHONE-SETUP.md`, then launch from the Home Screen. Confirm offline files are ready.
2. Check two items, force-close, reopen and verify progress. Repeat in Airplane Mode with the Mac launcher stopped.
3. Scroll ahead in a normal checklist and watch the return countdown. Touch/scroll again to restart it. Check the current item remains prominent with large text and landscape orientation.
4. Defer an item, complete the others, and confirm pending items prevent completion. Uncheck a completed item.
5. Open Emergency from the run, menu, editor and history screens. Scroll without automatic return. Return to the normal checklist and verify progress.
6. Create two variants, give them different progress, and switch between them.
7. Edit a checklist, leave a draft through Emergency, then reopen the draft. Save and restore an earlier revision. Confirm active run content changes only after an explicit restart.
8. Import a Markdown file, export it and inspect it in another editor. Download a full backup, make a change, then restore the backup through the explicit confirmation.
9. Finish a checklist and select the next procedure. Restart only one procedure, then try New flight. Revisions must survive both resets.
10. Test VoiceOver, larger text, reduced motion, portrait and landscape. Confirm Emergency remains reachable.

Record the iPhone model, iOS version and results here. None of these physical-device checks has been claimed as completed.
