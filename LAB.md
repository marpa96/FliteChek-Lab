# FliteChek Lab — the `rethink` branch

An experimental copy of FliteChek. The original app in `Desktop/Flight/FliteChek` is untouched.
`main` here is FliteChek as of 2026-11-10; `rethink` is the experiment.

Design priorities, in order:
1. **Legible and usable under stress** — big type, hard contrast, big targets, no decoration in the way.
2. **Impossible to run the wrong version** — the app resolves versions itself, shows why, and refuses to guess.
3. Polish.

## What's different

**Today's flight + Hangar.** Save each aircraft once (tail, type, school/operator, equipment). At the
start of a flight pick the tail, VFR/IFR, optionally the airport and conditions (e.g. Night). The tail
stays visible in the header.

**Every checklist resolves itself.** The checklist list shows, for each procedure, which version it
will open and why (`✓ C172S · VFR`). Most specific wins: tail › operator › equipment › type › airport ›
rules. When it can't decide it says so instead of guessing:
- `Set flight rules to choose` — more flight info is needed
- `2 equal versions — choose one` — the library has a tie (your pick is remembered for this flight)
- `No version for this flight` — you can still open one, behind a red "not for this flight" confirmation

**Base + changes (overlays).** Write a procedure once, then small "changes" files that only say what
differs for a school, tail, airport or condition. All matching changes layer on, most general first.
Every added line carries a tag (e.g. `N123DM`) in the run, and "•••" shows exactly what was changed.
A change whose target matches zero or several items is rejected and listed — never applied silently.

**Wrong-version protection mid-flight.** Each run remembers what it was resolved for. Change the
aircraft (or anything that changes the version) and the run turns red: `FOR ⚠ CHECK VERSION`, a banner
at the top, the CHECK button becomes `⚠ CHECK VERSION`, and auto-scroll pauses — until you restart with
the right version or explicitly "Keep using this one".

**Cockpit run screen.** Big current item, thumb-reach `✓ CHECK` (checks the current item), `◷ Later`,
`↶ Undo` for 8 s, a sliver of the previous item stays visible, the screen stays awake while a checklist
is open (where the browser supports it), and the original read-ahead countdown back to the current item.

**Emergency.** Red button everywhere → large procedure buttons with "Find by symptom" search, each
showing which version applies. A section headed `## Memory items` (or `Immediate action`) renders
huge, uppercase and red-outlined. Free scrolling, one tap back to the checklist you were on.

**Display.** Day, Night (red on black only; big buttons become outlines so they don't glow), Sun
(maximum contrast for direct sunlight), Auto by clock — one-tap toggle in the header. Text size:
Standard / Large / Extra large. iPad and landscape get a two-column home.

## Sandbox round 2 (tag `rethink-v1` is the build before this)

**Smart items.** FliteChek reads how an item is written and picks the clearest display. Nothing in your
Markdown changes.
- `Master Switch -- OFF` (also ` - `, ` — `, ` → `) shows like a printed checklist:
  `Master Switch ······ OFF`, with the action bold on the right. Long actions drop to their own line.
- Values (`2100 - 2700 RPM`, `110 KIAS`, `121.5 MHz`) get a monospace badge. Transponder codes (`SET 7600`)
  get a red code box.
- A wait in the text ("within 30 seconds", "3 to 5 seconds") gets a tap-to-start timer that beeps.
- `_____` blanks get a field to record the value, which then shows in the item.

**Glance.** In a checklist, switch List → Glance. One item fills the screen, and the whole card is the
check button, which is easier to hit in turbulence. Safety callouts that come right before an item show
above it. Memory items are red and uppercase, and squawk codes show as big digit boxes. The undo bar says
what you just did ("Checked: Ignition Switch"). A second check within 450 ms is ignored, so a bounced
finger can't skip an item.

**Flight timeline home.** Phase strip (Planning → Pre-Flight → Ground → In-Flight) with progress,
**Next up** card for the next checklist, and a **readiness check**. Before you fly it lists any checklist,
emergencies included, that has no single version for this flight, and any document whose own
"Applies to" line disagrees with how it's filed. On your real library it already flags Lost Comms (IFR
only), and on an IFR flight 7 checklists with no IFR version.

**"What's different?"** From the ••• details or the versions page. Compares this checklist for your
aircraft with its base version, or with any other aircraft in the hangar. It shows added, removed and
moved items, and folds identical runs. For example, your C172S vs C172R pre-flight: +17, −19, 5 moved,
38 the same.

**Document checks.** A file whose text says "Applies to: C172R" but is catalogued as the C172S version
gets a warning in the run and in readiness. That's your real C172S pre-flight today. The header
(owner, revision, dates) folds into one quiet line.

**Read aloud (experimental).** Settings → Cockpit, or •••. Speaks each item as it comes up, through
your headset if one's connected. It uses on-device voices, so it works offline where iOS has them.

**Offline guard.** `tests/offline-files.test.mjs` walks the real import graph and fails the build if
any file the app loads is missing from the offline install list.

Carried over unchanged: offline service worker, GitHub library updates & review, ZIP import, fuel
endurance calculator, revision history, backup/restore, recovery screen.

## Writing a changes file

Catalog entry (all template fields as usual, plus the new optional ones):

```yaml
  - id: "000201"
    title: Pre-Flight Inspection — Blue Sky changes
    procedure: pre-flight-inspection-blue-sky
    extends: pre-flight-inspection        # the base procedure
    operators: ["Blue Sky Aviation"]       # who it's for (any dimension works)
    aircraft_models: [C172S]
    # flight_rules / tail_numbers / airfields as usual; equipment / conditions optional
```

Markdown body — each `## Operation: target` names an item by the start of its text (whole words):

```markdown
# Blue Sky changes
<!-- flitechek-id: 000201 -->
## After: Fuel Selector Valve
- [ ] Item added after it
## Before: Pitot Tube Cover
- [ ] Item added before it
## Replace: Avionics Cooling Fan
- [ ] Replacement item
## Remove: Static Pressure Alternate Source Valve
## End of: CABIN
> [!NOTE]
> Added at the end of the CABIN section
```

New optional catalog fields: `operators`, `equipment`, `conditions`, `extends`. The in-app importer
(`src/catalog.js`) accepts them. **The Flight-Checklists GitHub build (`.flitechek/build.mjs`) does
not yet** — it still rejects unknown fields, so real changes files need that build updated first.

## Try it

**On iPhone/iPad:** open https://marpa96.github.io/FliteChek-Lab/ in Safari → Share → Add to Home Screen.
Pushing to `rethink` redeploys it; in the app, Settings → Offline & backup → **Update app & checklists**
switches to the newest build (progress is kept).

**On the Mac:**

```sh
npm ci && npm test        # 93 tests, incl. resolver + overlays
python3 -m http.server 8092 --directory web   # then open http://localhost:8092
```

Settings → Hangar → "Add demo aircraft & changes" adds N123DM (C172S, G1000) and N456DM (C172R) with two
[DEMO] changes files on your real C172S Pre-Flight Inspection, plus a memory-item layout demo. All demo
lines are placeholders, not procedures. "Remove demo data" deletes them.

Not yet tested on a real iPhone/iPad (wake lock, safe areas, Night brightness, Sun legibility outdoors).
