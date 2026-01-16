/**
 * @file onboard.ts
 * @brief Renders the onboarding screen for users without configured calendars.
 *
 * @description
 * Displays a message and a button prompting users to create their first calendar
 * when no calendar sources are configured. Integrates with the plugin's settings
 * and activates the calendar view after creation.
 *
 * @license See LICENSE.md
 */

import { CalendarInfo } from '../types';
import FullCalendarPlugin from '../main';
import { addCalendarButton } from './settings/SettingsTab';

export function renderOnboarding(plugin: FullCalendarPlugin, el: HTMLElement) {
  const nocal = el.createDiv('full-calendar-onboarding-container');
  const notice = nocal.createDiv();
  notice.createEl('h1').textContent = 'No calendars available';
  notice.createEl('p').textContent =
    'Thanks for downloading full calendar. Create a calendar below to begin.';

  const container = notice.createDiv();
  addCalendarButton(plugin, container, (source: CalendarInfo) => {
    void (async () => {
      const { calendarSources } = plugin.settings;
      calendarSources.push(source);
      await plugin.saveSettings();
      await plugin.activateView();
    })();
  });
}
