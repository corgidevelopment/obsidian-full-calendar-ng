# Manage events on the calendar

In addition to clicking on events to edit them directly, you can click-and-drag on events to change their characteristics as well.

## Moving events

Move an event around on a day or between days. This works just as well with all-day events.
![](../assets/moving-event.gif)

## Drag to change duration

Drag the endpoint of event to change ending time

![](../assets/edit-event-drag.gif)

---

## Creating and editing: validations and duplicates

When using the modal to create or edit an event, the plugin validates inputs in real time:

- Duplicate detection: If an event with the same date and final title would collide in its target calendar:
	- Full Note calendars: creation is blocked because the underlying filename would be identical (see below).
	- Daily Note calendars: duplicates are not allowed; another list item with the same visible title on that date under the configured heading will be flagged.
	- Note: Duplicate checks in Daily Notes compare the visible title (category prefix is ignored if Advanced Categories are enabled).
- Category-aware titles: If Advanced Categories are enabled, the Title field accepts "SubCategory - Title" and the Category is selected separately. The plugin reconstructs the full title when writing.

Limitations applied by calendar type during editing:

- Daily Note calendars do not support recurring events or multi-day single events.
- Recurring instance overrides inherit some properties (e.g., title/category) from the parent; attempting to edit those fields prompts to open the parent.

---

## Moving between calendars

- Currently, moving events is supported between Full Note calendars only. Moving to or from a Daily Note calendar is not supported.
