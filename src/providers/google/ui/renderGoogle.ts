/**
 * @file renderGoogle.ts
 * @brief Renders the Google Account management section of the settings tab.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { GoogleAuthManager } from '../auth/GoogleAuthManager';
import { t } from '../../../features/i18n/i18n';

export function renderGoogleSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  const authManager = new GoogleAuthManager(plugin);

  new Setting(containerEl).setName(t('google.title')).setHeading();

  const accounts = plugin.settings.googleAccounts || [];

  if (accounts.length === 0) {
    containerEl.createEl('p', {
      text: t('google.noAccounts')
    });
  }

  accounts.forEach(account => {
    new Setting(containerEl)
      .setName(account.email)
      .setDesc(t('google.accountDescription', { id: account.id }))
      .addButton(button => {
        button
          .setButtonText(t('google.buttons.disconnect'))
          .setWarning()
          .onClick(async () => {
            await authManager.removeAccount(account.id);
            rerender();
          });
      });
  });
}
