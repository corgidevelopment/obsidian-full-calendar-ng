# Calendar Workspaces

Save and switch between customized calendar setups with Workspaces. A workspace captures your current calendar configuration so you can quickly jump between different contexts like Planning, Personal, or Team.

## What is saved in a Workspace

- Selected calendar sources (Local, Daily Notes, ICS, CalDAV, Google)
- Filters: categories/sub-categories, tasks visibility, all‑day toggles
- Display options: view type (month/week/day/timeline), week start, time grid settings
- Optional: default start date range for the view

## Create and manage

1. Configure the calendar as you like (sources, filters, view).
2. Open the header menu and choose Save as Workspace.
3. Give it a name (e.g., "Planning", "Deep Work").
4. Use the workspace switcher in the header to load it later.

Tips:
- Set a Default Workspace in Settings to load it when opening the calendar.
- Rename or delete workspaces from the same menu.

## Filtering and quick switching

- Per‑workspace filters for categories and sources let you focus on what matters.
- Switch workspaces instantly from the header dropdown; switching is optimized to avoid full re‑renders.

## Keyboard and commands

- Command Palette: "Full Calendar: Switch Workspace" to pick one quickly.
- Optional hotkeys can be assigned per workspace via Obsidian’s Hotkeys.

## Performance notes

Workspace switching applies incremental updates where possible (sources, filters, and view) to keep transitions snappy even on large calendars.

## Troubleshooting

- If a source isn’t visible, check that it’s enabled for the current workspace.
- Category filters are additive; clear them to see all events.
- You can always return to an "All Events" default workspace.
