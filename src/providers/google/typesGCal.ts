export type GoogleProviderConfig = {
  id: string; // The Google Calendar ID (e.g., "primary", "user@gmail.com")
  name: string; // The display name of the calendar (e.g., "Personal", "Work")
  calendarId: string;
  /** Optional link to an account entry in settings (multi-account auth) */
  googleAccountId?: string;
};
