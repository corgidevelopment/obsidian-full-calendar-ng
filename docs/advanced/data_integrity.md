# Data Integrity and File Modifications

This plugin is designed to respect your data and your vault. We believe you should always be in control of your files. This page provides a transparent overview of every situation where the Full Calendar plugin might create or modify notes in your vault.

---

### 1. Explicit Modifications (User-Initiated)

These are large-scale changes that **only happen after you explicitly consent** through one or more confirmation windows.

#### Enabling/Disabling Advanced Categories

-   **What it does:** When you enable the **[Advanced Categories](../events/categories.md)** feature, the plugin offers to bulk-update your existing event notes to add a category to their titles (e.g., `My Meeting` becomes `Work - My Meeting`) and rename the corresponding note files. When you disable it, it offers to clean up your notes by removing those category prefixes and file names.
-   **How it's triggered:** By toggling "Enable Advanced Categorization" in the settings.
-   **User Control:** **This is a fully consented action.** You will be shown a detailed warning modal explaining the changes and must click "Proceed" to continue. You are in complete control of this process.

---

### 2. Side-Effect Modifications (Predictable)

These are file modifications that happen as a direct, predictable result of an action you take within the calendar UI.

#### Creating Daily Notes

-   **What it does:** If you use a "Daily Note" calendar and create or drag an event to a date for which a daily note does not yet exist, the plugin will create the note for you based on your Daily Note template.
-   **How it's triggered:** Creating a new event or moving an existing event to a new day in a Daily Note calendar.
-   **User Control:** This is an expected and necessary side-effect of using a Daily Note calendar. It saves you the step of having to manually create the note before adding an event to it.

#### Renaming Event Notes

-   **What it does:** When you edit an event's title or date in a Full Note calendar, the plugin will automatically rename the associated `.md` file to match (e.g., `2023-01-01 My Meeting.md`). This keeps your filenames in sync with your event data.
-   **How it's triggered:** Editing the title or date of an event in a Full Note calendar via the event modal.
-   **User Control:** This is a predictable side-effect of editing an event.

---

### 3. Implicit Modifications (Automatic)

This is the most important category to be aware of. These are modifications that may happen automatically to ensure feature compatibility.

#### Timezone Auto-Upgrade for Full Note Calendars

-   **What it does:** To support robust timezone conversions, timed events in "Full Note" calendars need a `timezone` field in their frontmatter. If the plugin detects a note from a previous version that is missing this field, it will add it.
-   **How it's triggered:** This modification happens automatically when the plugin reads an event note that doesn't have a timezone (e.g., when you open the calendar view).
-   **User Control & Future Plans:** This is the only modification that happens without direct, immediate consent. While its intention is to seamlessly upgrade your notes for timezone support, we recognize that any modification without a prompt can be surprising.
    -   **Our Plan:** We are working to change this behavior. In a future update, this will become a **one-time, user-initiated migration.** The plugin will detect all legacy notes and ask for your permission to upgrade them all at once, giving you full control.