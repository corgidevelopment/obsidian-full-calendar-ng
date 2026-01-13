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

  // Custom credentials toggle
  new Setting(containerEl)
    .setName(t('google.customCredentials.enable.label'))
    .setDesc(t('google.customCredentials.enable.description'))
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.useCustomGoogleClient).onChange(async value => {
        plugin.settings.useCustomGoogleClient = value;
        await plugin.saveSettings();
        rerender();
      });
    });

  // Custom credentials inputs (only shown when toggle is enabled)
  if (plugin.settings.useCustomGoogleClient) {
    new Setting(containerEl)
      .setName(t('google.customCredentials.clientId.label'))
      .setDesc(t('google.customCredentials.clientId.description'))
      .addText(text => {
        text.setValue(plugin.settings.googleClientId).onChange(async value => {
          plugin.settings.googleClientId = value;
          await plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t('google.customCredentials.clientSecret.label'))
      .setDesc(t('google.customCredentials.clientSecret.description'))
      .addText(text => {
        text.inputEl.type = 'password';
        text.setValue(plugin.settings.googleClientSecret).onChange(async value => {
          plugin.settings.googleClientSecret = value;
          await plugin.saveSettings();
        });
      });
  }

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
