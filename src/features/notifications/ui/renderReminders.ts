/**
 * @file renderReminders.ts
 * @brief Renders the reminders settings section of the plugin settings tab.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { t } from '../../i18n/i18n';

export function renderRemindersSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  new Setting(containerEl).setName(t('settings.reminders.title')).setHeading();

  new Setting(containerEl)
    .setName(t('settings.reminders.enableDefault.label'))
    .setDesc(t('settings.reminders.enableDefault.description'))
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.enableDefaultReminder);
      toggle.onChange(async val => {
        plugin.settings.enableDefaultReminder = val;
        await plugin.saveSettings();
        rerender();
      });
    });

  if (plugin.settings.enableDefaultReminder) {
    new Setting(containerEl)
      .setName(t('settings.reminders.defaultTime.label'))
      .setDesc(t('settings.reminders.defaultTime.description'))
      .addText(text => {
        text.inputEl.type = 'number';
        text.setValue(String(plugin.settings.defaultReminderMinutes));
        text.onChange(async val => {
          const parsed = parseInt(val, 10);
          if (!isNaN(parsed) && parsed >= 0) {
            plugin.settings.defaultReminderMinutes = parsed;
            await plugin.saveSettings();
          }
        });
      });
  }
}
