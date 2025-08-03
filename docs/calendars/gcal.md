# Two-way Sync Google Calender

You can add, edit and modify any private Google Calender over OAuth2.0 authentication. 

> Please use `Custom Google Cloud Credentials` option! Other option wont work until until google verifies the plugin. The setup is slightly involved, check below on how to set it up.

Calendars are automatically re-fetched from their source at most every five minutes. If you would like to revalidate remote calendars directly, you can run the command `Full Calendar: Revalidate remote calendars`.

## Using with Advanced Categories

CalDAV calendars are fully compatible with the **[Advanced Categories feature](../events/categories.md)**.

If an event from your CalDAV source has a title like `Personal - Doctor's Appointment`, the plugin will automatically parse "Personal" as the category and apply any custom color you have configured in the settings. This helps you visually organize events from all your devices.

---

## Setup OAuth2.0 Authentication ID and Secret

We will now setup Client ID and Secret Key for a Desktop Client for your personal use. You can google the setup or here is a quick guide on how to set it up:

1. Setup project in Google Console on some google account as follows:

![Google Console Project setup](../assets/google-cal-setup/1.google-console-project.gif)

2. Setup the project:

![Setup Project config](../assets/google-cal-setup/2.setup-config-for-oauth.gif)

3. Enable calender API:

![Enable calender API](../assets/google-cal-setup/3.calender-api-enable.gif)

4. Add the account for which you wish to use sync the calender as `Test User`:

![Enable calender API](../assets/google-cal-setup/4.%20add-test-user.gif)

5. Create the Key for `Desktop Client`:

![Setup Key](../assets/google-cal-setup/5.OuAuth-ID.gif)

6. Add the Key to Obsidian Plugin:

![Add Key to Plugin](../assets/google-cal-setup/6.Add-ID-to-Obsidian.gif)

