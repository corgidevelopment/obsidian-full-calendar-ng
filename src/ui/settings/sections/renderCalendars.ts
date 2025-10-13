/**
 * @file renderCalendars.ts
 * @brief Renders the calendar management section of the settings tab.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import * as ReactDOM from 'react-dom/client';
import { createElement, RefObject } from 'react';
import FullCalendarPlugin from '../../../main';
import { addCalendarButton } from '../SettingsTab';
import { CalendarSettings, CalendarSettingsRef } from './calendars/CalendarSetting';
import { CalendarInfo } from '../../../types/calendar_settings';
import { t } from '../../../features/i18n/i18n';

export function renderCalendarManagement(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  calendarSettingsRef: RefObject<CalendarSettingsRef>
): void {
  new Setting(containerEl).setName(t('settings.calendars.title')).setHeading();
  containerEl.createEl('hr', { cls: 'settings-view-new-divider' });
  const sourcesDiv = containerEl.createDiv();
  const root = ReactDOM.createRoot(sourcesDiv);
  root.render(
    createElement(CalendarSettings, {
      ref: calendarSettingsRef as React.Ref<CalendarSettings>,
      sources: plugin.providerRegistry.getAllSources(),
      plugin: plugin,
      submit: async (settings: CalendarInfo[]) => {
        plugin.settings.calendarSources = settings;
        await plugin.saveSettings();
      }
    })
  );
  addCalendarButton(
    plugin,
    containerEl,
    async (source: CalendarInfo) => {
      calendarSettingsRef.current?.addSource(source);
    },
    () => calendarSettingsRef.current?.getUsedDirectories() ?? []
  );
}
