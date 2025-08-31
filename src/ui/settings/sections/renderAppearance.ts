/**
 * @file renderAppearance.ts
 * @brief Renders the appearance-related settings section.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function renderAppearanceSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  new Setting(containerEl).setName('Appearance').setHeading();

  new Setting(containerEl)
    .setName('Starting day of the week')
    .setDesc('Choose what day of the week to start.')
    .addDropdown(dropdown => {
      WEEKDAYS.forEach((day, code) => {
        dropdown.addOption(code.toString(), day);
      });
      dropdown.setValue(plugin.settings.firstDay.toString());
      dropdown.onChange(async codeAsString => {
        plugin.settings.firstDay = Number(codeAsString);
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName('24-hour format')
    .setDesc('Display the time in a 24-hour format.')
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.timeFormat24h);
      toggle.onChange(async val => {
        plugin.settings.timeFormat24h = val;
        await plugin.saveSettings();
      });
    });

  // Business Hours Settings
  new Setting(containerEl)
    .setName('Enable business hours')
    .setDesc(
      'Highlight your working hours in time-grid views to distinguish work time from personal time.'
    )
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.businessHours.enabled);
      toggle.onChange(async val => {
        plugin.settings.businessHours.enabled = val;
        await plugin.saveSettings();
        rerender(); // This will show/hide the indented settings
      });
    });

  if (plugin.settings.businessHours.enabled) {
    new Setting(containerEl)
      .setName('Business days')
      .setDesc('Select which days of the week are business days.')
      .addDropdown(dropdown => {
        dropdown
          .addOption('1,2,3,4,5', 'Monday - Friday')
          .addOption('0,1,2,3,4,5,6', 'Every day')
          .addOption('1,2,3,4', 'Monday - Thursday')
          .addOption('2,3,4,5,6', 'Tuesday - Saturday');

        const currentDays = plugin.settings.businessHours.daysOfWeek.join(',');
        dropdown.setValue(currentDays);
        dropdown.onChange(async value => {
          plugin.settings.businessHours.daysOfWeek = value.split(',').map(Number);
          await plugin.saveSettings();
        });
      })
      .settingEl.addClass('fc-indented-setting');

    new Setting(containerEl)
      .setName('Business hours start time')
      .setDesc('When your working day begins (format: HH:mm)')
      .addText(text => {
        text.setValue(plugin.settings.businessHours.startTime);
        text.onChange(async value => {
          // Basic validation for time format
          if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
            plugin.settings.businessHours.startTime = value;
            await plugin.saveSettings();
          }
        });
      })
      .settingEl.addClass('fc-indented-setting');

    new Setting(containerEl)
      .setName('Business hours end time')
      .setDesc('When your working day ends (format: HH:mm)')
      .addText(text => {
        text.setValue(plugin.settings.businessHours.endTime);
        text.onChange(async value => {
          // Basic validation for time format
          if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
            plugin.settings.businessHours.endTime = value;
            await plugin.saveSettings();
          }
        });
      })
      .settingEl.addClass('fc-indented-setting');
  }

  // New granular view configuration section
  new Setting(containerEl).setName('View Time Range').setHeading();

  new Setting(containerEl)
    .setName('Earliest time to display')
    .setDesc('Set the earliest time visible in time grid views (format: HH:mm)')
    .addText(text => {
      text.setValue(plugin.settings.slotMinTime || '00:00');
      text.onChange(async value => {
        // Basic validation for time format
        if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
          plugin.settings.slotMinTime = value;
          await plugin.saveSettings();
        }
      });
    });

  new Setting(containerEl)
    .setName('Latest time to display')
    .setDesc('Set the latest time visible in time grid views (format: HH:mm)')
    .addText(text => {
      text.setValue(plugin.settings.slotMaxTime || '24:00');
      text.onChange(async value => {
        // Basic validation for time format (allow 24:00)
        if (/^([01]?[0-9]|2[0-4]):[0-5][0-9]$/.test(value)) {
          plugin.settings.slotMaxTime = value;
          await plugin.saveSettings();
        }
      });
    });

  new Setting(containerEl).setName('Day Visibility').setHeading();

  new Setting(containerEl)
    .setName('Show weekends')
    .setDesc('Whether to display weekend days (Saturday and Sunday) in the calendar')
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.weekends ?? true);
      toggle.onChange(async val => {
        plugin.settings.weekends = val;
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName('Hidden days')
    .setDesc('Select days of the week to hide from the calendar')
    .addDropdown(dropdown => {
      dropdown.addOption('[]', 'Show all days');
      dropdown.addOption('[0,6]', 'Hide weekends (Sun, Sat)');
      dropdown.addOption('[0]', 'Hide Sunday only');
      dropdown.addOption('[6]', 'Hide Saturday only');
      dropdown.addOption('[1]', 'Hide Monday');
      dropdown.addOption('[2]', 'Hide Tuesday');
      dropdown.addOption('[3]', 'Hide Wednesday');
      dropdown.addOption('[4]', 'Hide Thursday');
      dropdown.addOption('[5]', 'Hide Friday');

      const currentValue = JSON.stringify(plugin.settings.hiddenDays || []);
      dropdown.setValue(currentValue);
      dropdown.onChange(async value => {
        try {
          plugin.settings.hiddenDays = JSON.parse(value);
          await plugin.saveSettings();
        } catch (e) {
          // Invalid JSON, keep current value
        }
      });
    });

  new Setting(containerEl)
    .setName('Max events per day (month view)')
    .setDesc('Limit the number of events shown per day in month view')
    .addDropdown(dropdown => {
      dropdown.addOption('false', 'Use default limit');
      dropdown.addOption('true', 'No limit (show all)');
      dropdown.addOption('1', '1 event maximum');
      dropdown.addOption('2', '2 events maximum');
      dropdown.addOption('3', '3 events maximum');
      dropdown.addOption('4', '4 events maximum');
      dropdown.addOption('5', '5 events maximum');
      dropdown.addOption('10', '10 events maximum');

      const currentValue = (plugin.settings.dayMaxEvents ?? false).toString();
      dropdown.setValue(currentValue);
      dropdown.onChange(async value => {
        if (value === 'true') {
          plugin.settings.dayMaxEvents = true;
        } else if (value === 'false') {
          plugin.settings.dayMaxEvents = false;
        } else {
          plugin.settings.dayMaxEvents = parseInt(value);
        }
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName('Enable background events')
    .setDesc(
      'Allow events to be displayed as background elements for things like vacations, focus time, or class schedules.'
    )
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.enableBackgroundEvents);
      toggle.onChange(async val => {
        plugin.settings.enableBackgroundEvents = val;
        await plugin.saveSettings();
      });
    });

  // Show current event in status bar toggle
  new Setting(containerEl)
    .setName('Show current event in status bar')
    .setDesc('Display the title of the currently running event in the Obsidian status bar.')
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.showEventInStatusBar);
      toggle.onChange(async val => {
        plugin.settings.showEventInStatusBar = val;
        await plugin.saveSettings();
      });
    });
}
