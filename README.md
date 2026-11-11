# FliteChek

The app code lives in `Desktop/Flight/FliteChek`. The **only editable checklist source** is its sibling `Desktop/Flight/Flight-Checklists`, which you open in VS Code.

## Normal workflow

1. Edit checklist Markdown and `catalog.yaml` in **Flight-Checklists**.
2. Commit and push to GitHub `main`.
3. GitHub's **Publish FliteChek library** workflow validates the collection, automatically advances published revisions for changed content, and updates the generated `flitechek-library` branch.
4. Open FliteChek's Menu while connected. A downloaded update is offered for review. Tap **Review checklist updates → Install changes**. You can also explicitly check from **Import / update checklists**.

No manual packaging, copied checklist directories, GitHub token on the phone, or Mac connection is needed for checklist updates once the workflow is pushed. Bad packages leave the previous publication and installed library intact. Installing an update does not restart active runs. Offline operation continues from device storage.

The initial workflow/configuration changes must be committed and pushed once. Nothing is automatically pushed from your Mac by this project.

## Folder layout

- `../Flight-Checklists/`: authored Markdown, hidden IDs, catalog, and GitHub workflow.
- `web/`: app runtime and **generated** offline bootstrap data. Do not author checklists here.
- `src/`: import validation source; `web/catalog.js` is its offline bundle.
- `scripts/`: development/build utilities.
- `tests/`: regression tests.
- `.local/`: private certificates, server credentials, and rollback archives of retired duplicate sources/native prototype. Not an authoring folder.

There is no editable `checklists/` folder in this app anymore. The old CodingProjects project path has been removed, with no second copy or symlink.

## Display

Auto uses the device's local clock: Day from 06:00–18:00, Night from 18:00–06:00. It reevaluates when returning to the app and does not use iOS dark appearance. Manual Day/Night overrides remain until changed. This is a fixed schedule, not a sunrise/sunset calculation.

## Running and updating the prototype app

Double-click **Start FliteChek.command** for the Mac preview. Use **Start iPhone Setup.command** for local iPhone app installation or app-code updates. Checklist updates come from GitHub independently. See [iPhone setup](docs/IPHONE-SETUP.md).

`npm ci` installs development dependencies; `npm test` runs checks. `node scripts/package-library.mjs` is an optional developer fallback against the sibling source repository, not part of the everyday workflow.
