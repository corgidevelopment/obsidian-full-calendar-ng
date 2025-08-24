// src/ui/settings/sections/renderGoogle.ts

/**
 * @file renderGoogle.ts
 * @brief Renders the Google Account management section of the settings tab.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { GoogleAuthManager } from '../../../features/google_auth/GoogleAuthManager';

export function renderGoogleSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  const authManager = new GoogleAuthManager(plugin);

  new Setting(containerEl).setName('Google Accounts').setHeading();

  const accounts = plugin.settings.googleAccounts || [];

  if (accounts.length === 0) {
    containerEl.createEl('p', {
      text: 'No Google accounts connected. Add a calendar source to connect an account.'
    });
  }

  accounts.forEach(account => {
    new Setting(containerEl)
      .setName(account.email)
      .setDesc(`Connected account. ID: ${account.id}`)
      .addButton(button => {
        button
          .setButtonText('Disconnect')
          .setWarning()
          .onClick(async () => {
            await authManager.removeAccount(account.id);
            rerender();
          });
      });
  });
}
