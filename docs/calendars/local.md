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