# Tasks Plugin Integration

Unlock powerful task management by integrating the [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin directly into Full Calendar. This calendar source transforms your tasks into schedulable events with a dedicated backlog and full create, read, update, and delete (CRUD) support.

!!! success "Best for..."
    Users of the Obsidian Tasks plugin who want to visualize, schedule, and manage their tasks on a calendar. It's perfect for time-blocking and ensuring that important to-dos get the attention they deserve.

!!! tip "Requires Obsidian Tasks Plugin"
    This calendar source requires the [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin to be installed and enabled in your vault.

!!! warn "Tested with Obsidian Tasks Plugin 7.21.0"
    For best compactibility use this version. It is quite likely that the compactibility for newer tasks plugin version will break the existing features since most of the essential tasks integration is hardcoded due to lack of API - meaning its too expensive and time consuming to keep track of the changes in the Obsidian Tasks Plugin internal codebase!

## Setup

1.  In Full Calendar settings, go to the **Calendars** section.
2.  Click **New Calendar** and select the type **Tasks**.
3.  Give the calendar a name (e.g., "My Tasks") and assign it a color.

Once added, Full Calendar will automatically discover all tasks from your vault and display them.

![Enable Tasks Integration](../assets/tasks-integration.gif)

---

## Features

The Tasks calendar is more than just a read-only view; it's a fully interactive task management system.

### Task Backlog

A **Backlog** panel will appear in your calendar view, listing all unscheduled tasks. From here, you can drag and drop tasks directly onto the calendar to schedule them.

-   **Drag-and-Drop Scheduling:** Quickly schedule tasks by dragging them from the backlog to a specific date and time.
-   **Filtering:** Use the filter bar to narrow down tasks by status (`todo`, `done`) or by the file path they belong to.

![Task Backlog](../assets/task-backlog.gif)

### Full CRUD Support

You can manage your tasks without ever leaving the calendar interface.

-   **Create:** Create new tasks by clicking on the calendar or using the "Add Event" button.
-   **Read:** View all your scheduled and unscheduled tasks.
-   **Update:** Reschedule tasks by dragging them to a new time slot. Edit task details by clicking on the task to open the event editor. Mark tasks as complete by checking the box next to them.
-   **Delete:** Remove tasks from your calendar and your vault.

All changes are synced back to the Tasks plugin in real-time.

### Advanced Parsing and Settings

The integration is built with flexibility in mind.

-   **Multi-day Events:** The provider correctly parses tasks that span multiple days.
-   **Custom Statuses:** The plugin's parser can detect custom task statuses.
-   **Title Cleaning:** A setting is available to automatically strip tags from task titles for a cleaner look on the calendar.
