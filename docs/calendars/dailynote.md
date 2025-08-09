# Daily Note Calendar

Store events in-line in Daily Notes. Each event is a list item and event metadata is stored as [Dataview inline fields](https://blacksmithgu.github.io/obsidian-dataview/data-annotation/).

[Tasks](../../events/tasks) are supported with [checkboxes](https://help.obsidian.md/How+to/Format+your+notes) so you can easily track your to-dos for the day.

!!! tip "Power Up with Categories"
    Daily Note calendars also support **[Advanced Categories](../events/categories.md)**. You can add a category to your task list items (e.g., `- [ ] Work - Finish report`) to color-code your daily agenda.

## Prerequisites

You must be using one of the supported daily notes plugins in order to create a daily note calendar:

-   [Daily Notes core plugin](https://help.obsidian.md/Plugins/Daily+notes)
-   [Periodic Notes community plugin](https://github.com/liamcain/obsidian-periodic-notes)

## Configuring the Daily Notes calendar

Add a new calendar with the "Daily note" type, and select which heading from your daily note template that events should be placed under.

If your template does not have any headings, then you can enter free-form text to specify the heading that events will be placed under.

If a heading does not exist in a daily note, it will be appended to the end of the file before adding any events to it.

Note that only one daily note calendar can be active at a time.

![](../assets/dailynote.gif)

---

## Limitations and behavior nuances

- Recurring events cannot be created or edited in Daily Notes. Use a Full Note calendar for recurring series.
- Multi-day single events (with an `endDate`) are not supported in Daily Notes.
- Duplicate titles on the same day are not allowed. The editor will warn if another item under the heading already has the same visible title for that date.
- Only one Daily Note calendar source is supported at a time in settings.

---

## Timezone handling (Daily Notes)

Daily Note calendars support two modes, configurable in Settings → General → Daily note timezone:

- Local (default): Event times are interpreted relative to your computer's current timezone and are not stamped into the line.
- Strict: Event times are stamped with the current Display Timezone and are treated as anchored timestamps when written back.

In both modes, events are rendered in the Display Timezone you choose for the calendar view.
