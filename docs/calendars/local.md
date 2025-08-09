# Full Note Calendar

This is the most powerful and flexible calendar type. Each event is a separate note in your Obsidian vault, allowing you to add extensive notes, tasks, and links directly related to an event.

Events are defined by the YAML frontmatter at the top of the note. The plugin manages this frontmatter when you [create or edit events](../events/manage.md) in the calendar view.

The note's filename is also managed by the plugin to ensure it's easy to find, typically in the format `<YYYY-MM-DD> <Event title>.md`.

!!! success "Best for..."
    Users who want to treat events as first-class notes, adding rich context like meeting agendas, personal reflections, or related tasks. This is the only calendar type that supports all features, including multi-day events.

!!! tip "Power Up with Categories"
    Full Note calendars work seamlessly with the **[Advanced Categories](../events/categories.md)** feature, allowing you to color-code your events and organize them for timeline views. It's highly recommended!

## Setup

1.  In Full Calendar settings, add a new calendar source.
2.  Select the type **Full Note**.
3.  Choose an existing folder in your vault where your event notes will be stored.

![Add Full Note Calendar](../assets/add-calendar-source.gif)

---

## Filename conventions and duplicates

- Each event is stored as one Markdown file whose filename is derived from the event date and title. When Advanced Categories are enabled, the category/subcategory prefix is included in the filename.
- Invalid filename characters are sanitized (e.g., `:/\\*?"<>|` are replaced with spaces, consecutive spaces collapsed).
- Because filenames must be unique within the folder, two events with the same date and same final title resolve to the same filename and cannot both exist. Practically, this means:
    - Two single-day events on the same date with the same title are not allowed in the same Full Note calendar folder.
    - Recurring events use descriptive filenames (e.g., `(Every M,W) Title.md` or `(Every year on Jan 5) Title.md`) and will also be unique per series.

When creating or editing from the modal, the plugin performs a duplicate check and will block creation if a file with the target filename already exists.

---

## Timezone handling (Full Note)

- Full Note events are anchored to a specific timezone via the `timezone` field in frontmatter.
- When reading legacy notes that lack `timezone`, the plugin auto-upgrades them by writing your current display timezone into frontmatter to preserve accurate conversions.
- All times are converted to your chosen Display Timezone for viewing. See [Timezone Support](../events/timezones.md).

---

## Moving events between calendars

- Moving events between calendars is currently supported only between Full Note calendars.
- Moving to or from a Daily Note calendar is not supported.
