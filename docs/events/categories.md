# Category Coloring

Category Coloring allows you to override the default color of a calendar on an event-by-event basis. It works by parsing a category from the beginning of an event's title.

For example, if you have a "Work" category with a blue color, an event titled `Work - Team Meeting` will appear blue, even if it's on a calendar that is normally red.

!!! tip "Delimiter Format"
    The plugin uses a specific delimiter to separate the category from the title: a dash surrounded by spaces (` - `).
    - `✅ Correct: Work - Project Sync`
    - `❌ Incorrect: Work-Project Sync` (no spaces)
    - `❌ Incorrect: Work -Project Sync` (no space after dash)

## Enabling Category Coloring

This feature can perform a one-time, permanent modification of your event notes to add categories to titles. **It is highly recommended to back up your vault before enabling this feature.**

1.  Go to **Full Calendar Settings**.
2.  Find the **Category Coloring** section and toggle "Enable Category Coloring" on.
3.  You will see a warning modal explaining the changes. After proceeding, a second modal will ask how you want to bulk-categorize your existing events:
    -   **Use Parent Folder (Smart):** For any event that *doesn't* already have a category, its parent folder's name will be used as the category.
    -   **Use Parent Folder (Forced):** The parent folder's name will be prepended to *all* event titles, even if they already have a category (e.g., `NewCat - OldCat - Title`).
    -   **Forced Default Update:** You provide a category, and it will be prepended to *all* event titles.

<!-- TODO: Add GIF of new enable categories flow with both modals -->

## Disabling & Cleaning Up Categories

If you decide to turn off this feature, the plugin will help you clean up.

1.  Toggle "Enable Category Coloring" off.
2.  A warning modal will appear, explaining that this will remove known category prefixes from your event titles and file names, and will **permanently delete your saved category color settings.**
3.  If you proceed, the plugin will process all your local calendars to remove the `Category - ` prefix from event titles.

## Managing Category Colors

Once enabled, a new section will appear in the settings where you can manage your categories.

-   **Add a Category:** Start typing in the input box. The plugin will suggest categories it has found in your vault that you haven't configured yet. Click "Add" to add it to the list. A new color will be automatically assigned from the palette.
-   **Change Color:** Click the color swatch next to any category to change its color.
-   **Delete a Category:** Click "Delete" to remove a category setting. This does not remove the category from your event titles.
-   **Save:** After making changes, be sure to click "Save Category Settings".

<!-- TODO: Add GIF of new manage categories UI with autocomplete -->

## Usage in Remote Calendars

Category Coloring also works for read-only remote calendars (ICS/CalDAV). If an event from your Google Calendar has the title `Project X - Final Review`, the plugin will parse "Project X" as the category and apply the corresponding color if you have it configured in the settings.