# PicList terminal interface

Design direction: a quiet, focused workspace for moving images to their destination.

## Layout

- Compact brand line, current destination and backup state. Keep the configuration file path in contextual help.
- Four numbered sections: Upload, Destinations, Processing, Settings.
- At 76 columns and above: action list on the left, explanation and next steps on the right.
- Below 76 columns: one column, with the selected action's description below the list.
- A stable footer shows the current outcome and only the keyboard shortcuts relevant to the current screen.
- No configuration yet: select "Set up a destination" and explain the three setup steps.

## Visual language

Use the terminal's background and default foreground. Cyan is the single interactive accent, gray separates panels,
green marks success, yellow needs attention, and red marks errors. Pair every color with a label or symbol.
Use rounded, thin panel borders, full-row focus highlights, consistent two-character insets, sentence case and
generous space between sections. No emoji or special icon font is required.

## Interaction

- Tab / Shift+Tab, Left / Right, or 1–4 switches sections. Up / Down selects an action. Enter opens it.
- `/` opens a global action search; typing filters results, Up / Down chooses, Enter opens, Esc closes.
- Forms show the workflow name and field position within the current form. Fields have visible boundaries,
  required/optional labels, masked credentials and inline validation. Escape cancels without saving the pending form.
- Long choices can be filtered with `/`; Space toggles checkboxes. Selection remains visible while scrolling.
- Long text scrolls horizontally with its cursor; Unicode characters stay intact while editing. Ctrl+U clears
  the field, Home/End or Ctrl+A/E moves to either end, and Delete removes the next character.
- Progress shows the operation name, a spinner and the upload stage when available.
- Results use a selectable list plus a wrapped detail view for the full selected URL. Recent results remain accessible
  after changing settings. Enter returns to the workspace; `r` reopens results.
- `q` quits from the workspace. Ctrl+C cancels a form or waits for active work before exiting.

## Implementation checks

Exercise 100×30, 80×24 and 52×22 terminals, long URLs, empty search results, first-run setup, form cancellation,
masked credentials, async validation, tab navigation and keyboard focus. Preserve all existing upload/configuration APIs.

The companion `tui-design.html` is an interactive design study with workspace, setup, form and results states.
