/**
 * @file GoogleAuthManager.ts
 * @brief Centralized manager for Google account authentication and token handling.
 * @license See LICENSE.md
 */

import { requestUrl, Notice } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { CalendarInfo } from '../../../types';
import { GoogleAccount } from '../../../types/settings';
// generateCalendarId import removed - was unused
import { t } from '../../../features/i18n/i18n';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PROXY_REFRESH_URL = 'https://gcal-proxy-server.vercel.app/api/google/refresh';
const PUBLIC_CLIENT_ID = '272284435724-ltjbog78np5lnbjhgecudaqhsfba9voi.apps.googleusercontent.com';
const PRIMARY_CALENDAR_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList/primary';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  [key: string]: unknown;
}

// Type alias for a Google source from Zod schema
type GoogleCalendarInfo = Extract<CalendarInfo, { type: 'google' }>;

// Type for legacy auth object found on a source
type LegacyAuth = {
  refreshToken: string | null;
  accessToken: string | null;
  expiryDate: number | null;
};

export class GoogleAuthManager {
  private plugin: FullCalendarPlugin;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  /**
   * Refreshes an access token using a refresh token for a specific account or legacy source.
   * This method MUTATES the provided account/auth object and SAVES settings.
   */
  private async refreshAccessToken(
    authObj: GoogleAccount | LegacyAuth,
    isLegacy: boolean // This parameter is now effectively unused but safe to keep
  ): Promise<string | null> {
    const { settings } = this.plugin;
    if (!authObj.refreshToken) {
      const email = 'email' in authObj ? authObj.email : 'unknown';
      const id = 'id' in authObj ? authObj.id : 'unknown';
      console.error(`No refresh token available. Account: ${email} (ID: ${id})`);
      return null;
    }

    const clientId = settings.useCustomGoogleClient ? settings.googleClientId : PUBLIC_CLIENT_ID;

    let tokenUrl: string;
    let requestBody: string;
    let requestHeaders: Record<string, string>;

    if (settings.useCustomGoogleClient) {
      tokenUrl = GOOGLE_TOKEN_URL;
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: authObj.refreshToken,
        client_secret: settings.googleClientSecret
      });
      requestBody = body.toString();
      requestHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
    } else {
      tokenUrl = PROXY_REFRESH_URL;
      const body = {
        client_id: clientId,
        refresh_token: authObj.refreshToken
      };
      requestBody = JSON.stringify(body);
      requestHeaders = { 'Content-Type': 'application/json' };
    }

    try {
      const response = await requestUrl({
        method: 'POST',
        url: tokenUrl,
        headers: requestHeaders,
        body: requestBody,
        throw: false
      });

      if (response.status >= 200 && response.status < 300) {
        const data = response.json as GoogleTokenResponse;
        // Mutate the object that was passed in
        authObj.accessToken = data.access_token;
        authObj.expiryDate = Date.now() + data.expires_in * 1000;

        // Save settings to persist the new token
        await this.plugin.saveSettings();
        return data.access_token;
      }

      // If we get here, it's an error status from Google
      console.error(
        `Failed to refresh Google access token. Status: ${response.status} Body: ${response.text}`
      );

      // Only wipe credentials if it's a permanent auth error (400 Bad Request, 401 Unauthorized)
      // This protects against 500s or other temporary issues where we shouldn't lose the user's login.
      if (response.status === 400 || response.status === 401) {
        if (!isLegacy && 'id' in authObj) {
          const account = this.plugin.settings.googleAccounts.find(a => a.id === authObj.id);
          if (account) {
            account.accessToken = null;
            account.refreshToken = null;
            account.expiryDate = null;
          }
        }
        await this.plugin.saveSettings();
        new Notice(t('google.auth.expired'));
      }
      return null;
    } catch (e) {
      // This catch block will now mostly catch network errors (offline),
      // since we set throw: false for HTTP status errors.
      console.error('Network error during Google token refresh:', e);
      // Do NOT wipe credentials here. Just return null so the fetch fails gracefully for now.
      return null;
    }
  }

  /**
   * Retrieves a valid access token for a given Google calendar source.
   * It handles both the new multi-account model (via `googleAccountId`) and the legacy
   * embedded `auth` object model with a fallback.
   */
  public async getTokenForSource(source: GoogleCalendarInfo): Promise<string | null> {
    // The ONLY path is now the multi-account path.
    if (!source.googleAccountId) {
      console.error(
        'Google source is missing a googleAccountId. It may need to be re-added.',
        source
      );
      new Notice(t('google.auth.authFailed'));
      return null;
    }

    const account = this.plugin.settings.googleAccounts.find(a => a.id === source.googleAccountId);
    if (!account) {
      console.error(`Could not find Google account with ID: ${source.googleAccountId}`);
      return null;
    }

    if (account.accessToken && account.expiryDate && Date.now() < account.expiryDate - 60000) {
      return account.accessToken;
    }
    return this.refreshAccessToken(account, false);

    // Legacy fallback removed.
  }

  /**
   * Fetches the user's primary calendar ID, which is their email address.
   */
  private async getPrimaryCalendarId(accessToken: string): Promise<string> {
    const response = await requestUrl({
      url: PRIMARY_CALENDAR_URL,
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    // The 'id' field of the primary calendar is the user's email.
    return (response.json as { id: string }).id;
  }

  /**
   * Adds a new Google Account to the plugin's settings.
   * This is called after a successful OAuth flow.
   */
  public async addAccount(auth: {
    refreshToken: string;
    accessToken: string;
    expiryDate: number;
  }): Promise<GoogleAccount> {
    const userEmail = await this.getPrimaryCalendarId(auth.accessToken);
    const newAccount: GoogleAccount = {
      id: `gcal_${userEmail}`,
      email: userEmail,
      ...auth
    };

    const existingAccounts = this.plugin.settings.googleAccounts || [];
    const index = existingAccounts.findIndex(a => a.id === newAccount.id);
    if (index !== -1) {
      existingAccounts[index] = newAccount;
    } else {
      existingAccounts.push(newAccount);
    }
    this.plugin.settings.googleAccounts = existingAccounts;
    await this.plugin.saveSettings();

    // Notify UI that a Google account was added
    this.plugin.app.workspace.trigger('full-calendar:google-account-added');

    return newAccount;
  }

  /**
   * Removes a Google Account and all its associated calendars.
   */
  public async removeAccount(accountId: string): Promise<void> {
    this.plugin.settings.googleAccounts = (this.plugin.settings.googleAccounts || []).filter(
      a => a.id !== accountId
    );
    this.plugin.settings.calendarSources = this.plugin.settings.calendarSources.filter(
      s => !(s.type === 'google' && s.googleAccountId === accountId)
    );
    await this.plugin.saveSettings();
  }
}
