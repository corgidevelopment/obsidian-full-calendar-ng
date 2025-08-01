# Advanced Categories


This is a very **powerful** feature that will be essential for a lot of planned upcoming features, as it unifies all the events irrespective of what source the events come from! It is **HIGHLY RECOMMENDED** to start using this to make full use of upcoming exciting features!

### Suit of features leveraging this:
1. *Category Coloring* allows you to override the default color of a calendar on an event-by-event basis. It works by parsing a category from the beginning of an event's title.


For example, if you have a "Work" category with a blue color, an event titled `Work - Team Meeting` will appear blue, even if it's on a calendar that is normally red.


2. *Category Timeline View*: Coming soon!



!!! tip "Delimiter Format"
    The plugin uses a specific delimiter to separate the category from the title: a dash surrounded by spaces (` - `).
    - `✅ Correct: Work - Project Sync`
    - `❌ Incorrect: Work-Project Sync` (no spaces)
    - `❌ Incorrect: Work -Project Sync` (no space after dash)

!!! important "Choice of this format"
    Its easy to question why such a view implemetation and why not just add another category property to the event. This is done to make it compactible with REMOTE calenders most of them doesnt have a category property. Because current cateorization works on parsing the title it will still work for all calenders as long as the user follows it up! 

## Recommendation

It highly adviced to start using this feature (please read this page in full so that you are aware of what happens when you do that!) and specifically to use the following format for the title of your events: 

`Category - Subcategory - Name` (Yes, it is important to have dash enclosed by spaces on both sides!). 

What you will see in your calender will be `Subcategory - Name` as the event name, the Category part is parsed and striped out for internal useage. This is to keep the calender clean plus you can change category either in the Timeline view (coming soon) or in the edit modal when you create or edit an event (there is a new Category option with really cool Autocomplete feature so you don't have to byheart your Categories!).

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