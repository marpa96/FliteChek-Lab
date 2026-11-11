# Reusable calculator trial

Fuel endurance lives in `web/fuel.js`, independent of checklist content. Only the registered calculator link below opens the tool; Markdown cannot execute scripts.

Any checklist can include:

```markdown
- [ ] [Calculate fuel endurance](flitechek:calculator/fuel)
- [ ] Usable fuel: {{fuel.amount}}
- [ ] Fuel burn: {{fuel.burn}}
- [ ] Estimated endurance: {{fuel.endurance}}
```

The tool uses its own full main screen and large keypad. Next advances from usable fuel to hourly burn. Calculate & return saves a result into the calling run and returns to its calculator row. Results and unfinished inputs are local to each run; they are not silently shared between aircraft or procedures. Cancel leaves the last applied result intact. Restarting a run clears its result. Applying a new calculation clears dependent checkmarks for renewed review.

Use consistent US gallons and gallons/hour, or liters and liters/hour. Changing units clears draft values rather than relabeling them. Endurance is fuel divided by burn, rounded down to whole minutes. Zero fuel is accepted; zero burn and missing, negative or nonfinite values are rejected. No reserve, aircraft performance, destination, or diversion recommendation is included. The bundled diversion checklist is an interface test only.
