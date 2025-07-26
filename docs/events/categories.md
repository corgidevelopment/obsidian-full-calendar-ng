# Category Coloring

Category Coloring allows you to override the default color of a calendar on an event-by-event basis. It works by parsing a category from the beginning of an event's title.

For example, if you have a "Work" category with a blue color, an event titled `Work - Team Meeting` will appear blue, even if it's on a calendar that is normally red.

!!! tip "Delimiter Format"
    The plugin uses a specific delimiter to separate the category from the title: a dash surrounded by spaces (` - `).
    - `✅ Correct: Work - Project Sync`
    - `❌ Incorrect: Work-Project Sync` (no spaces)
    - `❌ Incorrect: Work -Project Sync` (no space after dash)


## Enabling Category Coloring

This feature performs a one-time, permanent modification of your event notes to add categories to titles. **It is highly recommended to back up your vault before enabling this feature.**

1.  Go to **Full Calendar Settings**.
2.  Find the **Category Coloring** section and toggle "Enable Category Coloring" on.
3.  You will be presented with a warning modal explaining the changes. After proceeding, you will be asked to choose a method for bulk-categorizing your existing events.

<!-- ![Enable Categories](../assets/enable-categories.gif) -->

## Managing Category Colors

Once enabled, a new section will appear in the settings where you can manage your categories.

-   **Add a Category:** Type a new category name and click "Add". A new color will be automatically assigned from the palette.
-   **Change Color:** Click the color swatch next to any category to change its color.
-   **Delete a Category:** Click "Delete" to remove a category setting. This does not remove the category from your event titles.
-   **Save:** After making changes, be sure to click "Save Category Settings".

<!-- ![Manage Categories](../assets/manage-categories.gif) -->

## Usage in Remote Calendars

Category Coloring also works for read-only remote calendars (ICS/CalDAV). If an event from your Google Calendar has the title `Project X - Final Review`, the plugin will parse "Project X" as the category and apply the corresponding color if you have it configured in the settings.