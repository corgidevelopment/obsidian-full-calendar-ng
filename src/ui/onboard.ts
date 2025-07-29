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

import { App } from 'obsidian';
import FullCalendarPlugin from '../main';
import { addCalendarButton } from './settings/SettingsTab';
import { CalendarInfo } from '../types';

export function renderOnboarding(plugin: FullCalendarPlugin, el: HTMLElement) {
  el.style.height = '100%';
  const nocal = el.createDiv();
  nocal.style.height = '100%';
  nocal.style.display = 'flex';
  nocal.style.alignItems = 'center';
  nocal.style.justifyContent = 'center';
  const notice = nocal.createDiv();
  notice.createEl('h1').textContent = 'No calendar available';
  notice.createEl('p').textContent =
    'Thanks for downloading Full Calendar! Create a calendar below to begin.';

  const container = notice.createDiv();
  container.style.position = 'fixed';
  addCalendarButton(plugin, container, async (source: CalendarInfo) => {
    const { calendarSources } = plugin.settings;
    calendarSources.push(source);
    await plugin.saveSettings();
    await plugin.activateView();
  });
}
