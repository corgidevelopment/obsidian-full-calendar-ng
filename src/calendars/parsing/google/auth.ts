/**
 * @file auth.ts
 * @brief Handles all OAuth 2.0 logic for Google Calendar integration.
 *
 * @description
 * This module manages the OAuth 2.0 Authorization Code Flow with PKCE.
 * It handles generating auth URLs, exchanging the authorization code for tokens,
 * storing tokens securely, and automatically refreshing the access token when it expires.
 *
 * @license See LICENSE.md
 */

import { Platform, requestUrl, Notice } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import * as http from 'http';
import * as url from 'url';

// =================================================================================================
// CONSTANTS
// =================================================================================================

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES =
  'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';

const MOBILE_REDIRECT_URI =
  'https://youfoundjk.github.io/plugin-full-calendar/google-auth-callback.html';
const DESKTOP_REDIRECT_URI = 'http://127.0.0.1:42813/callback';

const PUBLIC_CLIENT_ID = '783376961232-v90b17gr1mj1s2mnmdauvkp77u6htpke.apps.googleusercontent.com';

// =================================================================================================
// MODULE STATE
// =================================================================================================

let pkce: { verifier: string; state: string } | null = null;
let server: http.Server | null = null;

// =================================================================================================
// PKCE HELPER FUNCTIONS
// =================================================================================================

function generateRandomString(length: number): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(a: ArrayBuffer): string {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(a) as any))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hashed = await sha256(verifier);
  return base64urlencode(hashed);
}

function startDesktopLogin(plugin: FullCalendarPlugin, authUrl: string): void {
  if (server) {
    window.open(authUrl);
    return;
  }
  server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        // No URL, so we can't do anything. Just end the request.
        res.end();
        return;
      }

      // Only process requests to the /callback path. Ignore others like /favicon.ico
      if (!req.url.startsWith('/callback')) {
        res.writeHead(204); // "No Content" response
        res.end();
        return;
      }

      // console.log('[Full Calendar Google Auth] Received callback. Full request URL:', req.url);
      const queryParams = url.parse(req.url, true).query;
      // console.log('[Full Calendar Google Auth] Parsed Query Parameters:', queryParams);

      const { code, state } = url.parse(req.url, true).query;

      if (typeof code !== 'string' || typeof state !== 'string') {
        throw new Error('Invalid callback parameters');
      }

      res.end('Authentication successful! Please return to Obsidian.');

      if (server) {
        server.close();
        server = null;
      }

      await exchangeCodeForToken(code, state, plugin);
      // Refresh the settings tab if it's open
      plugin.settingsTab?.display();
    } catch (e) {
      console.error('Error handling Google Auth callback:', e);
      res.end('Authentication failed. Please check the console in Obsidian and try again.');
      if (server) {
        server.close();
        server = null;
      }
    }
  });
  server.listen(42813, () => {
    window.open(authUrl);
  });
}

// =================================================================================================
// EXPORTED AUTHENTICATION FUNCTIONS
// =================================================================================================

/**
 * Kicks off the Google OAuth 2.0 flow.
 */
export async function startGoogleLogin(plugin: FullCalendarPlugin): Promise<void> {
  const state = generateRandomString(16);
  const verifier = generateRandomString(128);
  const challenge = await generateCodeChallenge(verifier);

  // Store the verifier and state to be used in the callback.
  pkce = { verifier, state };

  const { settings } = plugin;
  const isMobile = Platform.isMobile;

  const clientId = settings.useCustomGoogleClient ? settings.googleClientId : PUBLIC_CLIENT_ID;
  const redirectUri = isMobile ? MOBILE_REDIRECT_URI : DESKTOP_REDIRECT_URI;

  if (settings.useCustomGoogleClient && (!clientId || !settings.googleClientSecret)) {
    new Notice('Custom Google Client ID and Secret must be set in the plugin settings.');
    return;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    prompt: 'consent',
    access_type: 'offline',
    state: state,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });

  const authUrl = `${AUTH_URL}?${params.toString()}`;
  if (isMobile) {
    window.open(authUrl);
  } else {
    startDesktopLogin(plugin, authUrl);
  }
}

export async function exchangeCodeForToken(
  code: string,
  state: string,
  plugin: FullCalendarPlugin
): Promise<void> {
  if (!pkce || state !== pkce.state) {
    new Notice('Google authentication failed. State mismatch.');
    console.error('State mismatch during OAuth callback.');
    return;
  }

  const { settings } = plugin;
  const isMobile = Platform.isMobile;
  const redirectUri = isMobile ? MOBILE_REDIRECT_URI : DESKTOP_REDIRECT_URI;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: settings.useCustomGoogleClient ? settings.googleClientId : PUBLIC_CLIENT_ID,
    code: code,
    code_verifier: pkce.verifier,
    redirect_uri: redirectUri
  });

  if (settings.useCustomGoogleClient) {
    body.append('client_secret', settings.googleClientSecret);
  }

  try {
    const response = await requestUrl({
      method: 'POST',
      url: TOKEN_URL,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = response.json;
    if (!data.refresh_token) {
      throw new Error(
        "No refresh token received. If you are using a custom client, ensure it is configured for a 'Desktop app' and has not already been used to grant a refresh token."
      );
    }

    plugin.settings.googleAuth = {
      refreshToken: data.refresh_token,
      accessToken: data.access_token,
      expiryDate: Date.now() + data.expires_in * 1000
    };
    await plugin.saveSettings();
    new Notice('Successfully connected Google Account!');
  } catch (e) {
    new Notice('Failed to connect Google Account. Check the developer console for details.');
    console.error(e);
  } finally {
    pkce = null;
  }
}

async function refreshAccessToken(plugin: FullCalendarPlugin): Promise<string | null> {
  const { settings } = plugin;
  if (!settings.googleAuth?.refreshToken) {
    console.error('No refresh token available.');
    return null;
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: settings.useCustomGoogleClient ? settings.googleClientId : PUBLIC_CLIENT_ID,
    refresh_token: settings.googleAuth.refreshToken
  });

  if (settings.useCustomGoogleClient) {
    body.append('client_secret', settings.googleClientSecret);
  }

  try {
    const response = await requestUrl({
      method: 'POST',
      url: TOKEN_URL,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = response.json;
    settings.googleAuth = {
      ...settings.googleAuth,
      accessToken: data.access_token,
      expiryDate: Date.now() + data.expires_in * 1000
    };
    await plugin.saveData(settings);
    return data.access_token;
  } catch (e) {
    console.error('Failed to refresh Google access token:', e);
    settings.googleAuth = null;
    await plugin.saveSettings();
    new Notice('Google authentication expired. Please reconnect your account.');
    return null;
  }
}

export async function getGoogleAuthToken(plugin: FullCalendarPlugin): Promise<string | null> {
  const { googleAuth } = plugin.settings;
  if (!googleAuth?.refreshToken) {
    return null;
  }

  if (
    googleAuth.accessToken &&
    googleAuth.expiryDate &&
    Date.now() < googleAuth.expiryDate - 60000
  ) {
    return googleAuth.accessToken;
  }

  return await refreshAccessToken(plugin);
}
