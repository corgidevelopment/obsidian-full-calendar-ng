/**
 * @file GoogleConfigComponent.tsx
 * @brief React component for the new multi-account Google Calendar setup wizard.
 * @license See LICENSE.md
 */

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Setting } from 'obsidian';
import { GoogleAccount } from '../../types/settings';
import { startGoogleLogin } from './auth';
import FullCalendarPlugin from '../../main';
import { GoogleApiError } from './request';
import { GoogleAuthManager } from '../../features/google_auth/GoogleAuthManager'; // Import the manager

// ADD this new type definition. It accurately describes what the component passes back.
type SelectedGoogleCalendar = {
  id: string; // The Google Calendar ID (e.g., "primary", "user@gmail.com")
  name: string;
  color: string;
};

interface GoogleConfigComponentProps {
  plugin: FullCalendarPlugin;
  onSave: (configs: SelectedGoogleCalendar[], accountId: string) => void;
  onClose: () => void;
}

export const GoogleConfigComponent: React.FC<GoogleConfigComponentProps> = ({
  plugin,
  onSave,
  onClose
}) => {
  const [view, setView] = useState<'account-select' | 'calendar-select'>('account-select');
  const [accounts, setAccounts] = useState<GoogleAccount[]>(plugin.settings.googleAccounts || []);
  const [selectedAccount, setSelectedAccount] = useState<GoogleAccount | null>(null);
  interface CalendarListDisplayItem {
    id: string;
    summary: string;
    backgroundColor?: string;
    description?: string;
  }
  const [availableCalendars, setAvailableCalendars] = useState<CalendarListDisplayItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const authManager = new GoogleAuthManager(plugin); // Create an instance of the manager

  // Refs for imperative Obsidian UI components
  const accountListRef = useRef<HTMLDivElement>(null);
  const calendarListRef = useRef<HTMLDivElement>(null);

  // REMOVE legacy polling useEffect:
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     const latestAccounts = plugin.settings.googleAccounts || [];
  //     if (latestAccounts.length !== accounts.length) {
  //       setAccounts(latestAccounts);
  //     }
  //   }, 500);
  //   return () => clearInterval(interval);
  // }, [plugin.settings.googleAccounts, accounts.length]);

  // ADD event-driven update for accounts list:
  useEffect(() => {
    const handleAccountAdded = () => {
      const latestAccounts = plugin.settings.googleAccounts || [];
      setAccounts([...latestAccounts]);
    };
    (plugin.app.workspace as unknown as { on: (name: string, cb: () => void) => void }).on(
      'full-calendar:google-account-added',
      handleAccountAdded
    );
    return () => {
      (plugin.app.workspace as unknown as { off: (name: string, cb: () => void) => void }).off(
        'full-calendar:google-account-added',
        handleAccountAdded
      );
    };
  }, [plugin]);

  const handleSelectAccount = async (account: GoogleAccount) => {
    setIsLoading(true);
    setError(null);
    setSelectedAccount(account);

    try {
      // Refresh token if it's expired before we use it
      if (!account.accessToken || !account.expiryDate || Date.now() >= account.expiryDate - 60000) {
        // Use public API (getTokenForSource) to trigger refresh logic.
        const token = await authManager.getTokenForSource({
          type: 'google',
          id: `temp_${account.id}`,
          name: account.email,
          calendarId: 'primary',
          googleAccountId: account.id,
          color: ''
        } as Extract<import('../../types').CalendarInfo, { type: 'google' }>);
        if (!token) {
          throw new GoogleApiError(
            `Failed to refresh token for ${account.email}. Please try connecting the account again.`
          );
        }
        account.accessToken = token;
      }

      const { fetchGoogleCalendarList } = await import('./api');
      // REMOVE THE HACK and pass the account object directly.
      const allCalendars = await fetchGoogleCalendarList(plugin, account);
      const existingGoogleIds = new Set(
        plugin.settings.calendarSources
          .filter(
            (s): s is Extract<typeof s, { type: 'google'; calendarId: string }> =>
              s.type === 'google'
          )
          .map(s => s.calendarId)
      );
      setAvailableCalendars(allCalendars.filter(cal => !existingGoogleIds.has(cal.id)));
      setView('calendar-select');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'An unknown error occurred.';
      setError(`Failed to fetch calendars for ${account.email}. ${message}`);
      setView('account-select');
    } finally {
      setIsLoading(false);
      // REMOVE THE HACK CLEANUP
    }
  };

  const handleToggle = (id: string, value: boolean) => {
    setSelection(prev => {
      const newSelection = new Set(prev);
      if (value) newSelection.add(id);
      else newSelection.delete(id);
      return newSelection;
    });
  };

  const handleSave = () => {
    if (!selectedAccount) return;
    const selectedConfigs = availableCalendars
      .filter(cal => selection.has(cal.id))
      .map(cal => ({
        id: cal.id,
        name: cal.summary,
        color: cal.backgroundColor || ''
      }));
    onSave(selectedConfigs, selectedAccount.id);
    onClose();
  };

  // Effect for rendering the account list imperatively
  useEffect(() => {
    if (view === 'account-select' && accountListRef.current) {
      const container = accountListRef.current;
      container.empty(); // Clear previous content

      accounts.forEach(account => {
        new Setting(container)
          .setName(account.email)
          .addButton(button =>
            button.setButtonText('Select Calendars').onClick(() => handleSelectAccount(account))
          );
      });

      new Setting(container).setName('Connect a new account').addButton(button =>
        button
          .setButtonText('Connect Google Account')
          .setCta()
          .onClick(() => startGoogleLogin(plugin))
      );
    }
  }, [view, accounts, plugin]); // Rerun when view or accounts change

  // Effect for rendering the calendar list imperatively
  useEffect(() => {
    if (view === 'calendar-select' && calendarListRef.current) {
      const container = calendarListRef.current;
      container.empty();

      availableCalendars.forEach(cal => {
        new Setting(container)
          .setName(cal.summary)
          .setDesc(cal.description || '')
          .addToggle(toggle => {
            toggle.setValue(selection.has(cal.id)).onChange(value => handleToggle(cal.id, value));
          });
      });
    }
  }, [view, availableCalendars, selection]); // Rerun when data changes

  if (isLoading) return <div>Loading...</div>;

  if (view === 'account-select') {
    return (
      <div>
        <div className="setting-item setting-item-heading">
          <div className="setting-item-info">
            <div className="setting-item-name">Connect a Google Account</div>
          </div>
        </div>
        {error && <p className="mod-warning">{error}</p>}
        {/* Container for imperative settings */}
        <div ref={accountListRef}></div>
      </div>
    );
  }

  if (view === 'calendar-select') {
    return (
      <div>
        <div className="setting-item setting-item-heading">
          <div className="setting-item-info">
            <div className="setting-item-name">{`Select Calendars from ${selectedAccount?.email}`}</div>
            <div className="setting-item-description">
              {availableCalendars.length === 0
                ? 'No new calendars found, or all calendars from this account have been added.'
                : 'Choose which calendars you would like to add to Obsidian.'}
            </div>
          </div>
        </div>
        {/* Container for imperative settings */}
        <div ref={calendarListRef}></div>

        <div className="setting-item">
          <div className="setting-item-control">
            <button onClick={() => setView('account-select')}>Back to Accounts</button>
            <button
              className="mod-cta"
              style={{ marginLeft: 'auto' }}
              onClick={handleSave}
              disabled={selection.size === 0}
            >
              Add {selection.size || ''} Calendar{selection.size === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
