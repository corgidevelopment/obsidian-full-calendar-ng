# Privacy Policy

_Last updated: August 6, 2025_

**Full Calendar (Remastered) Plugin** is a plugin for Obsidian that allows you to synchronize your Google Calendar and use it within Obsidian. It uses the Google Calendar API for synchronization of calendar events.

## Information We Access

With your permission, the plugin accesses the following Google Calendar data via the Google Calendar API:

- Your calendar list (metadata about your calendars)
- Calendar events (including event titles, descriptions, start/end times, and attendees)

We do **not** access any other Google account data beyond what is required to display and manage your calendar events in Obsidian.

## How Data Is Used

The accessed calendar data is used **solely for displaying and managing events** within Obsidian. The plugin caches calendar data during the session and it is discarded when the session ends. **No Data** is stored in any remote servers. All data is fetched in real-time from Google and displayed only within your Obsidian environment.

## Data Protection and Security

- Calendar data is transmitted **directly between Obsidian and Google servers** using secure HTTPS connections.
- No calendar data is stored on our intermediary server.
- During the authentication process, our intermediary server **temporarily receives an OAuth authorization code**, which is used only to complete the authentication flow and is **immediately discarded** after use.
- We do **not store**, share, or process any user data beyond what is necessary to facilitate authentication and access to Google Calendar through the plugin.

## OAuth Scopes

The plugin requests the following OAuth scopes:

- `https://www.googleapis.com/auth/calendar.events` — View and edit events on all your calendars (core functionality of the plugin).
- `https://www.googleapis.com/auth/calendar.readonly` — See and download any calendar you can access using your Google Calendar (required 1) for cached rendering during the session; 2) Selecting the relevant calendar among other calendars associated with the account).

These scopes are required to enable synchronization between Google Calendar and Obsidian and are used strictly for their intended purpose.

## Opt out Policy

- You are free to opt out at any time — simply disconnect your Google Account and all your Google Calendar data will be immediately removed from the system permanently.

## Contact

If you have any questions or concerns about this Privacy Policy or data handling practices, please contact us at [here](https://github.com/YouFoundJK/plugin-full-calendar).
