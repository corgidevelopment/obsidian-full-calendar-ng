# Google Calendar Two-Way Sync

Easily add, edit, and delete events from your private Google Calendar directly in Obsidian using **OAuth 2.0 authentication**.

!!! info You must use the **Custom Google Cloud Credentials** option. The default option will not work until Google officially verifies the plugin.

Calendars automatically refresh every **5 minutes**.
To manually refresh calendars, run the command:
`Full Calendar: Revalidate remote calendars`

---

## Using with Advanced Categories

Google Calendar events fully support the **[Advanced Categories feature](../events/categories.md)**.

If an event title is formatted like `Personal - Doctor's Appointment`, the plugin will automatically detect **Personal** as the category and apply any custom color configured in your settings.
This helps you keep events organized across all your devices.

---

## Setting Up OAuth 2.0 Authentication

You’ll need to create your own **Google OAuth Client ID and Secret** for personal use.
Here’s how to set it up step by step:

### 1️⃣ Create a Project in Google Cloud Console

![Google Console Project Setup](../assets/google-cal-setup/1.google-console-project.gif)

### 2️⃣ Configure OAuth Consent Screen

![Setup Project Config](../assets/google-cal-setup/2.setup-config-for-oauth.gif)

### 3️⃣ Enable the Google Calendar API

![Enable Calendar API](../assets/google-cal-setup/3.calender-api-enable.gif)

### 4️⃣ Add Your Google Account as a Test User

![Add Test User](../assets/google-cal-setup/4.%20add-test-user.gif)

### 5️⃣ Create OAuth Credentials for a Desktop Client

![Create OAuth ID](../assets/google-cal-setup/5.OuAuth-ID.gif)

### 6️⃣ Add Your Client ID and Secret to the Plugin

![Add ID to Plugin](../assets/google-cal-setup/6.Add-ID-to-Obsidian.gif)

---

Once completed, you’ll be able to **sync your Google Calendar both ways**—any changes made in Obsidian will be reflected in Google Calendar, and vice versa.

Notes:

- Google calendars are writable from Obsidian (create, edit, delete). Some edits to a single instance of a recurring series create proper exceptions.
- Duplicate checks are not enforced for Google; the source allows same-name events.
- Events are converted into your chosen Display Timezone for viewing.
