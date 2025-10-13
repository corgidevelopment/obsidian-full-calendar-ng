/**
 * @file renderAppearance.ts
 * @brief Renders the appearance-related settings section.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { t } from '../../../features/i18n/i18n';

const WEEKDAYS_KEYS = [
  'settings.weekdays.sunday',
  'settings.weekdays.monday',
  'settings.weekdays.tuesday',
  'settings.weekdays.wednesday',
  'settings.weekdays.thursday',
  'settings.weekdays.friday',
  'settings.weekdays.saturday'
];

export function renderAppearanceSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  new Setting(containerEl).setName(t('settings.appearance.title')).setHeading();

  new Setting(containerEl)
    .setName(t('settings.appearance.firstDay.label'))
    .setDesc(t('settings.appearance.firstDay.description'))
    .addDropdown(dropdown => {
      WEEKDAYS_KEYS.forEach((dayKey, code) => {
        dropdown.addOption(code.toString(), t(dayKey));
      });
      dropdown.setValue(plugin.settings.firstDay.toString());
      dropdown.onChange(async codeAsString => {
        plugin.settings.firstDay = Number(codeAsString);
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName(t('settings.appearance.timeFormat24h.label'))
    .setDesc(t('settings.appearance.timeFormat24h.description'))
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.timeFormat24h);
      toggle.onChange(async val => {
        plugin.settings.timeFormat24h = val;
        await plugin.saveSettings();
      });
    });

  // Business Hours Settings
  new Setting(containerEl)
    .setName(t('settings.appearance.businessHours.enable.label'))
    .setDesc(t('settings.appearance.businessHours.enable.description'))
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
      .setName(t('settings.appearance.businessHours.days.label'))
      .setDesc(t('settings.appearance.businessHours.days.description'))
      .addDropdown(dropdown => {
        dropdown
          .addOption('1,2,3,4,5', t('settings.appearance.businessHours.options.mondayFriday'))
          .addOption('0,1,2,3,4,5,6', t('settings.appearance.businessHours.options.everyDay'))
          .addOption('1,2,3,4', t('settings.appearance.businessHours.options.mondayThursday'))
          .addOption('2,3,4,5,6', t('settings.appearance.businessHours.options.tuesdaySaturday'));

        const currentDays = plugin.settings.businessHours.daysOfWeek.join(',');
        dropdown.setValue(currentDays);
        dropdown.onChange(async value => {
          plugin.settings.businessHours.daysOfWeek = value.split(',').map(Number);
          await plugin.saveSettings();
        });
      })
      .settingEl.addClass('fc-indented-setting');

    new Setting(containerEl)
      .setName(t('settings.appearance.businessHours.startTime.label'))
      .setDesc(t('settings.appearance.businessHours.startTime.description'))
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
      .setName(t('settings.appearance.businessHours.endTime.label'))
      .setDesc(t('settings.appearance.businessHours.endTime.description'))
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
  new Setting(containerEl).setName(t('settings.appearance.viewTimeRange.title')).setHeading();

  new Setting(containerEl)
    .setName(t('settings.appearance.viewTimeRange.slotMinTime.label'))
    .setDesc(t('settings.appearance.viewTimeRange.slotMinTime.description'))
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
    .setName(t('settings.appearance.viewTimeRange.slotMaxTime.label'))
    .setDesc(t('settings.appearance.viewTimeRange.slotMaxTime.description'))
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

  new Setting(containerEl).setName(t('settings.appearance.dayVisibility.title')).setHeading();

  new Setting(containerEl)
    .setName(t('settings.appearance.dayVisibility.weekends.label'))
    .setDesc(t('settings.appearance.dayVisibility.weekends.description'))
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.weekends ?? true);
      toggle.onChange(async val => {
        plugin.settings.weekends = val;
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName(t('settings.appearance.dayVisibility.hiddenDays.label'))
    .setDesc(t('settings.appearance.dayVisibility.hiddenDays.description'))
    .addDropdown(dropdown => {
      dropdown.addOption('[]', t('settings.appearance.dayVisibility.hiddenDays.options.showAll'));
      dropdown.addOption(
        '[0,6]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideWeekends')
      );
      dropdown.addOption(
        '[0]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideSunday')
      );
      dropdown.addOption(
        '[6]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideSaturday')
      );
      dropdown.addOption(
        '[1]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideMonday')
      );
      dropdown.addOption(
        '[2]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideTuesday')
      );
      dropdown.addOption(
        '[3]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideWednesday')
      );
      dropdown.addOption(
        '[4]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideThursday')
      );
      dropdown.addOption(
        '[5]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideFriday')
      );

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
    .setName(t('settings.appearance.dayMaxEvents.label'))
    .setDesc(t('settings.appearance.dayMaxEvents.description'))
    .addDropdown(dropdown => {
      dropdown.addOption('false', t('settings.appearance.dayMaxEvents.options.default'));
      dropdown.addOption('true', t('settings.appearance.dayMaxEvents.options.unlimited'));
      dropdown.addOption('1', t('settings.appearance.dayMaxEvents.options.one'));
      dropdown.addOption('2', t('settings.appearance.dayMaxEvents.options.two'));
      dropdown.addOption('3', t('settings.appearance.dayMaxEvents.options.three'));
      dropdown.addOption('4', t('settings.appearance.dayMaxEvents.options.four'));
      dropdown.addOption('5', t('settings.appearance.dayMaxEvents.options.five'));
      dropdown.addOption('10', t('settings.appearance.dayMaxEvents.options.ten'));

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
    .setName(t('settings.appearance.enableBackgroundEvents.label'))
    .setDesc(t('settings.appearance.enableBackgroundEvents.description'))
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.enableBackgroundEvents);
      toggle.onChange(async val => {
        plugin.settings.enableBackgroundEvents = val;
        await plugin.saveSettings();
      });
    });

  // Show current event in status bar toggle
  new Setting(containerEl)
    .setName(t('settings.appearance.showEventInStatusBar.label'))
    .setDesc(t('settings.appearance.showEventInStatusBar.description'))
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.showEventInStatusBar);
      toggle.onChange(async val => {
        plugin.settings.showEventInStatusBar = val;
        await plugin.saveSettings();
      });
    });
}
