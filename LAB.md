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
