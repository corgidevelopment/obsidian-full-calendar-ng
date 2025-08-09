# Getting Started

## First-Time Setup

When you open Full Calendar for the first time, you'll be prompted to add your first calendar source.

It's recommended to start with a local calendar type, as these are editable directly from the plugin.

-   **[Full Note Calendar](calendars/local.md):** The most powerful option. Each event is a separate note in your vault.

-   **[Daily Note Calendar](calendars/dailynote.md):** Store events as checklist items in your daily notes, in a efficient and compact way.

Remote calendars (ICS/CalDAV) are read-only.

!!! tip
    Use a combination for Full Note (for recurring and other detailed events) and Daily Note Calender (daily events stored compactly). Also check out [Advanced Categorization]((events/categories.md)) and its **event naming convention**, to unleash the full power of this plugin and supercharge your workflow!

![Welcome page](assets/welcome-settings.gif)

## Opening the Calendar

You can open the main calendar view in two ways:
1.  Click the **Calendar icon** in the Obsidian ribbon (the left-hand bar).
2.  Run the command `Full Calendar: Open Calendar` from the command palette (`Ctrl/Cmd + P`).

![Open calendar](assets/open-calendar.gif)

## Sidebar Calendar

For quick reference, you can open a more compact version of the calendar in the sidebar. Run the command `Full Calendar: Open in sidebar`.

![Sidebar calendar](assets/sidebar.gif)

## Troubleshooting

If something is not working as expected, the first thing to try is resetting the event cache.
-   Run the command `Full Calendar: Reset Event Cache`.

This forces the plugin to re-read all events from all your sources. If this doesn't fix the problem, please [submit an issue on GitHub](https://github.com/YouFoundJK/plugin-full-calendar/issues).