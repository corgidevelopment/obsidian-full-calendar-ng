/**
 * @file renderGeneral.ts
 * @brief Renders the general settings section of the plugin settings tab.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';

const INITIAL_VIEW_OPTIONS = {
  DESKTOP: {
    timeGridDay: 'Day',
    timeGridWeek: 'Week',
    dayGridMonth: 'Month',
    listWeek: 'List'
  },
  MOBILE: {
    timeGrid3Days: '3 Days',
    timeGridDay: 'Day',
    listWeek: 'List'
  }
};

export function renderGeneralSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  const desktopViewOptions: { [key: string]: string } = { ...INITIAL_VIEW_OPTIONS.DESKTOP };
  if (plugin.settings.enableAdvancedCategorization) {
    desktopViewOptions['resourceTimelineWeek'] = 'Timeline Week';
    desktopViewOptions['resourceTimelineDay'] = 'Timeline Day';
  }

  new Setting(containerEl)
    .setName('Desktop initial view')
    .setDesc('Choose the initial view range on desktop devices.')
    .addDropdown(dropdown => {
      Object.entries(desktopViewOptions).forEach(([value, display]) => {
        dropdown.addOption(value, display);
      });
      dropdown.setValue(plugin.settings.initialView.desktop);
      dropdown.onChange(async initialView => {
        plugin.settings.initialView.desktop = initialView;
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName('Mobile initial view')
    .setDesc('Choose the initial view range on mobile devices.')
    .addDropdown(dropdown => {
      Object.entries(INITIAL_VIEW_OPTIONS.MOBILE).forEach(([value, display]) => {
        dropdown.addOption(value, display);
      });
      dropdown.setValue(plugin.settings.initialView.mobile);
      dropdown.onChange(async initialView => {
        plugin.settings.initialView.mobile = initialView;
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName('Display timezone')
    .setDesc(
      'Choose the timezone for displaying events. Defaults to your system timezone. Changing this will reload the calendar.'
    )
    .addDropdown(dropdown => {
      const timezones = Intl.supportedValuesOf('timeZone');
      timezones.forEach(tz => {
        dropdown.addOption(tz, tz);
      });
      dropdown.setValue(
        plugin.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      );
      dropdown.onChange(async newTimezone => {
        plugin.settings.displayTimezone = newTimezone;
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName('Click on a day in month view to create event')
    .setDesc('Switch off to open day view on click instead.')
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.clickToCreateEventFromMonthView);
      toggle.onChange(async val => {
        plugin.settings.clickToCreateEventFromMonthView = val;
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName('Enable event reminders')
    .setDesc('Show a desktop notification 10 minutes before an event starts.')
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.enableReminders).onChange(async value => {
        plugin.settings.enableReminders = value;
        await plugin.saveSettings();
        rerender();
      });
    });

  new Setting(containerEl)
    .setName('Remove tags from task titles')
    .setDesc(
      'Remove #tags from task titles when displayed on the calendar for cleaner appearance. ' +
        'The original task notes are not modified - this only affects calendar display.'
    )
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.removeTagsFromTaskTitle).onChange(async value => {
        plugin.settings.removeTagsFromTaskTitle = value;
        await plugin.saveSettings();
        rerender();
      });
    });
}
