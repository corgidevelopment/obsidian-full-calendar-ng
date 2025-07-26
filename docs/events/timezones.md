# Timezone Support

Full Calendar is fully timezone-aware to ensure that your events are always accurate, especially if you travel, work with remote teams, or use calendar feeds from different timezones.

## Display Timezone

This is the most important setting. It determines the timezone that the entire calendar view is rendered in. By default, it uses your computer's local system timezone.

You can override this in **Settings → Display & Behavior → Display Timezone**.

Changing this is useful for:

-   **Trip Planning:** Set the display timezone to your destination's timezone to see your schedule as it will be locally.

-   **Remote Collaboration:** Set it to a colleague's timezone to easily schedule meetings.

<!-- ![Set Display Timezone](assets/set-display-timezone.gif) -->

## How Timezones are Handled

The plugin works to find the "source of truth" for an event's time and then convert it to your chosen display timezone.

-   **Remote Calendars (ICS/CalDAV):** Events from sources like Google Calendar almost always have timezone information embedded in them (e.g., `TZID=America/New_York`). The plugin reads this information and performs a precise conversion. UTC events are also handled correctly.
-   **Full Note Calendars:** When you create or edit a timed event in a Full Note Calendar, the plugin automatically stamps it with your current display timezone in the frontmatter (e.g., `timezone: Europe/London`). This anchors the event to a specific moment in time.
-   **Daily Note Calendars:** These have two modes, configurable in settings:
    -   **Local (Default):** Times are "floating" and are always interpreted in your computer's current timezone. This is flexible but can shift if you travel.
    -   **Strict:** Behaves like a Full Note Calendar. Events are stamped with the display timezone, anchoring them in time.