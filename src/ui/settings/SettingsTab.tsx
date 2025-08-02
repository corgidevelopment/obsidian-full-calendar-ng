/**
 * @file SettingsTab.tsx
 * @brief Implements the Full Calendar plugin's settings tab UI for Obsidian.
 *
 * @description
 * This file defines the `FullCalendarSettingTab` class, which extends Obsidian's
 * `PluginSettingTab` to provide a comprehensive settings interface for the plugin.
 * It includes configuration for calendar sources, initial views, time formats,
 * timezone handling, category coloring (with bulk modification and cleanup), and
 * a "What's New" section with a full changelog viewer. The UI combines native
 * Obsidian components and React-based components for advanced settings management.
 *
 * Key features:
 * - Manage and add calendar sources (local, daily note, iCloud, CalDAV, iCal).
 * - Configure initial calendar views for desktop and mobile.
 * - Set week start day, time format, and display timezone.
 * - Enable/disable category coloring with bulk note modification and cleanup.
 * - View and manage category color settings.
 * - "What's New" and full changelog display.
 *
 * @exports FullCalendarSettingTab
 * @exports ensureCalendarIds
 *
 * @see ../components/CalendarSetting.tsx
 * @see ../components/CategorySetting.tsx
 * @see ../modals/BulkCategorizeModal.tsx
 * @see ./changelogData.ts
 * @see ../ReactModal.tsx
 * @license See LICENSE.md
 */

import FullCalendarPlugin from '../../main';
import {
  App,
  DropdownComponent,
  Notice,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  Modal,
  TextComponent
} from 'obsidian';
import * as ReactDOM from 'react-dom/client';
import { createElement, createRef } from 'react';

import ReactModal from '../ReactModal';
import { AddCalendarSource } from '../components/AddCalendarSource';
import { importCalendars } from '../../calendars/parsing/caldav/import';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { makeDefaultPartialCalendarSource, CalendarInfo } from '../../types/calendar_settings';
import { CalendarSettings, CalendarSettingsRef } from '../components/CalendarSetting';
import { changelogData } from './changelogData';
import './changelog.css';
import { CategorySettingsManager } from '../components/CategorySetting';
import { InsightsConfig } from '../../chrono_analyser/ui/ui';
import { generateCalendarId } from '../../types/calendar_settings';
import { BulkCategorizeModal } from '../modals/BulkCategorizeModal';
import { FullCalendarSettings } from '../../types/settings';
import { startGoogleLogin } from '../../calendars/parsing/google/auth';
import { fetchGoogleCalendarList } from '../../calendars/parsing/google/api';
import { getNextColor } from '../colors';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

export function addCalendarButton(
  plugin: FullCalendarPlugin,
  containerEl: HTMLElement,
  submitCallback: (setting: CalendarInfo) => void,
  listUsedDirectories?: () => string[]
) {
  let dropdown: DropdownComponent;
  const directories = plugin.app.vault
    .getAllLoadedFiles()
    .filter(f => f instanceof TFolder)
    .map(f => f.path);

  return new Setting(containerEl)
    .setName('Calendars')
    .setDesc('Add calendar')
    .addDropdown(
      d =>
        (dropdown = d.addOptions({
          local: 'Full note',
          dailynote: 'Daily Note',
          icloud: 'iCloud',
          caldav: 'CalDAV',
          ical: 'Remote (.ics format)',
          google: 'Google Calendar'
        }))
    )
    .addExtraButton(button => {
      button.setTooltip('Add Calendar');
      button.setIcon('plus-with-circle');
      button.onClick(async () => {
        const sourceType = dropdown.getValue();

        if (sourceType === 'google') {
          if (!plugin.settings.googleAuth?.refreshToken) {
            new Notice('Please connect your Google Account first.');
            return;
          }

          try {
            const calendars = await fetchGoogleCalendarList(plugin);
            new SelectGoogleCalendarsModal(plugin, calendars, selected => {
              selected.forEach(cal => submitCallback(cal));
            }).open();
          } catch (e: any) {
            new Notice(`Error fetching calendar list: ${e.message}`);
            console.error(e);
          }
          return;
        }

        let modal = new ReactModal(plugin.app, async () => {
          await plugin.loadSettings();
          const usedDirectories = (
            listUsedDirectories
              ? listUsedDirectories
              : () =>
                  plugin.settings.calendarSources
                    .map((s: CalendarInfo) => s.type === 'local' && s.directory)
                    .filter((s): s is string => !!s)
          )();
          let headings: string[] = [];
          let { template } = getDailyNoteSettings();

          if (template) {
            if (!template.endsWith('.md')) {
              template += '.md';
            }
            const file = plugin.app.vault.getAbstractFileByPath(template);
            if (file instanceof TFile) {
              headings =
                plugin.app.metadataCache.getFileCache(file)?.headings?.map(h => h.heading) || [];
            }
          }

          const existingCalendarColors = plugin.settings.calendarSources.map(s => s.color);

          return createElement(AddCalendarSource, {
            source: makeDefaultPartialCalendarSource(
              dropdown.getValue() as CalendarInfo['type'],
              existingCalendarColors
            ),
            directories: directories.filter(dir => usedDirectories.indexOf(dir) === -1),
            headings,
            submit: async (source: CalendarInfo) => {
              if (source.type === 'caldav') {
                try {
                  const existingIds = plugin.settings.calendarSources.map(s => s.id);
                  let sources = await importCalendars(
                    {
                      type: 'basic',
                      username: source.username,
                      password: source.password
                    },
                    source.url,
                    existingIds
                  );
                  sources.forEach(source => submitCallback(source));
                } catch (e) {
                  if (e instanceof Error) {
                    new Notice(e.message);
                  }
                }
              } else {
                submitCallback(source);
              }
              modal.close();
            }
          });
        });
        modal.open();
      });
    });
}

export class FullCalendarSettingTab extends PluginSettingTab {
  plugin: FullCalendarPlugin;

  constructor(app: App, plugin: FullCalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    let showFullChangelog = false;

    const render = () => {
      containerEl.empty(); // Clear the entire settings tab on re-render

      // ====================================================================
      // Full Changelog View (Conditional)
      // ====================================================================
      if (showFullChangelog) {
        // TODO: In a future step, this will be replaced by a call to a dedicated render function.
        // For now, you can leave this logic here, but know we will extract it.
        const changelogWrapper = containerEl.createDiv('full-calendar-changelog-wrapper');

        const header = changelogWrapper.createDiv('full-calendar-changelog-header');
        const backButton = header.createEl('button', { text: '<' });
        backButton.addEventListener('click', () => {
          showFullChangelog = false;
          render(); // Re-render the settings view
        });
        new Setting(header).setName('Changelog').setHeading();

        changelogData.forEach((version, index) => {
          const versionContainer = changelogWrapper.createDiv('full-calendar-version-container');

          // This is our new clickable header
          const header = versionContainer.createDiv('full-calendar-version-header');
          header.createEl('h3', { text: `Version ${version.version}` });

          // This is our new collapsible content area
          const content = versionContainer.createDiv('full-calendar-version-content');

          // Set the initial collapsed/expanded state
          if (index === 0) {
            header.addClass('is-open'); // Mark the header as open
          } else {
            content.addClass('is-collapsed'); // Hide the content
          }

          // Add the click handler to toggle the state
          header.addEventListener('click', () => {
            header.toggleClass('is-open', !header.hasClass('is-open'));
            content.toggleClass('is-collapsed', !content.hasClass('is-collapsed'));
          });

          // Populate the content area with the changes
          version.changes.forEach(change => {
            const changeEl = content.createDiv(
              `full-calendar-change-item change-type-${change.type}`
            );
            const iconEl = changeEl.createDiv('change-icon');
            if (change.type === 'new') iconEl.setText('✨');
            if (change.type === 'improvement') iconEl.setText('🔧');
            if (change.type === 'fix') iconEl.setText('🐛');
            const contentEl = changeEl.createDiv('change-content');
            contentEl.createEl('div', { cls: 'change-title', text: change.title });
            contentEl.createEl('div', { cls: 'change-description', text: change.description });
          });
        });

        return; // Stop here to only show the changelog
      }

      // ====================================================================
      // Standard Settings View
      // ====================================================================

      const desktopViewOptions: { [key: string]: string } = { ...INITIAL_VIEW_OPTIONS.DESKTOP };
      if (this.plugin.settings.enableAdvancedCategorization) {
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
          dropdown.setValue(this.plugin.settings.initialView.desktop);
          dropdown.onChange(async initialView => {
            this.plugin.settings.initialView.desktop = initialView;
            await this.plugin.saveSettings();
          });
        });

      new Setting(containerEl)
        .setName('Mobile initial view')
        .setDesc('Choose the initial view range on mobile devices.')
        .addDropdown(dropdown => {
          Object.entries(INITIAL_VIEW_OPTIONS.MOBILE).forEach(([value, display]) => {
            dropdown.addOption(value, display);
          });
          dropdown.setValue(this.plugin.settings.initialView.mobile);
          dropdown.onChange(async initialView => {
            this.plugin.settings.initialView.mobile = initialView;
            await this.plugin.saveSettings();
          });
        });

      new Setting(containerEl)
        .setName('Starting day of the week')
        .setDesc('Choose what day of the week to start.')
        .addDropdown(dropdown => {
          WEEKDAYS.forEach((day, code) => {
            dropdown.addOption(code.toString(), day);
          });
          dropdown.setValue(this.plugin.settings.firstDay.toString());
          dropdown.onChange(async codeAsString => {
            this.plugin.settings.firstDay = Number(codeAsString);
            await this.plugin.saveSettings();
          });
        });

      new Setting(containerEl)
        .setName('Daily note timezone')
        .setDesc(
          'Choose how times in daily notes are handled. "Local" means times are relative to your computer\'s current timezone. "Strict" will anchor events to the display timezone, writing it to the note.'
        )
        .addDropdown(dropdown => {
          dropdown
            .addOption('local', 'Local (Flexible)')
            .addOption('strict', 'Strict (Anchored to display timezone)');

          dropdown.setValue(this.plugin.settings.dailyNotesTimezone);

          dropdown.onChange(async value => {
            this.plugin.settings.dailyNotesTimezone = value as 'local' | 'strict';
            await this.plugin.saveSettings();
          });
        });

      new Setting(containerEl)
        .setName('Display timezone')
        .setDesc(
          'Choose the timezone for displaying events. Defaults to your system timezone. Changing this will reload the calendar.'
        )
        .addDropdown(dropdown => {
          // ==================== TEMPORARY DEBUG MODIFICATION ====================
          // const timezones = [
          //   'Europe/Budapest',
          //   'Australia/Perth',
          //   'Asia/Kolkata' // Note: 'India/Calcutta' is a legacy name, 'Asia/Kolkata' is the standard.
          // ];
          const timezones = Intl.supportedValuesOf('timeZone'); // <-- This is the original line
          // ======================================================================
          timezones.forEach(tz => {
            dropdown.addOption(tz, tz);
          });
          dropdown.setValue(
            this.plugin.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone
          );
          dropdown.onChange(async newTimezone => {
            this.plugin.settings.displayTimezone = newTimezone;
            await this.plugin.saveSettings();
          });
        });

      new Setting(containerEl)
        .setName('24-hour format')
        .setDesc('Display the time in a 24-hour format.')
        .addToggle(toggle => {
          toggle.setValue(this.plugin.settings.timeFormat24h);
          toggle.onChange(async val => {
            this.plugin.settings.timeFormat24h = val;
            await this.plugin.saveSettings();
          });
        });

      new Setting(containerEl)
        .setName('Click on a day in month view to create event')
        .setDesc('Switch off to open day view on click instead.')
        .addToggle(toggle => {
          toggle.setValue(this.plugin.settings.clickToCreateEventFromMonthView);
          toggle.onChange(async val => {
            this.plugin.settings.clickToCreateEventFromMonthView = val;
            await this.plugin.saveSettings();
          });
        });

      // ====================================================================
      // CATEGORY COLORING SECTION
      // ====================================================================
      new Setting(containerEl).setName('Advanced categorization and Timeline').setHeading();

      new Setting(containerEl)
        .setName('Enable Advanced Categorization (Title-based)')
        .setDesc(
          'Enable category-based coloring and unlock timeline views. This will modify event note titles and allow timeline visualization by category.'
        )
        .addToggle(toggle => {
          toggle
            .setValue(this.plugin.settings.enableAdvancedCategorization)
            .onChange(async value => {
              const isTogglingOn = value;

              if (isTogglingOn) {
                const confirmModal = new Modal(this.app);
                // Add a class to the modal's container for specific styling
                confirmModal.modalEl.addClass('full-calendar-confirm-modal');

                const { contentEl } = confirmModal;

                contentEl.createEl('h2', { text: '⚠️ Permanent Vault Modification' });

                contentEl.createEl('p', {
                  text: 'Enabling this feature will permanently modify event notes in your vault.'
                });

                // Use a highlighted div for the technical explanation
                const highlightEl = contentEl.createDiv('fc-confirm-highlight');
                const p1 = highlightEl.createEl('p');
                p1.innerHTML =
                  'We use the delimiter <code> - </code> (a dash with space on either side) to add a category to event titles.';

                const p2 = highlightEl.createEl('p');
                p2.innerHTML =
                  'For example, an event named <strong>"My Meeting"</strong> will become <strong>"Category - My Meeting"</strong>.';

                contentEl.createEl('p', {
                  text: 'This process will also rename the associated note files to match the new titles. This cannot be easily undone.'
                });

                const backupEl = contentEl.createEl('p');
                backupEl.innerHTML =
                  'It is <strong>STRONGLY RECOMMENDED</strong> to <strong>BACKUP</strong> your vault before continuing.';

                new Setting(contentEl)
                  .addButton(btn =>
                    btn
                      .setButtonText('Proceed and Modify My Notes')
                      .setWarning() // Keep the warning class for button color
                      .onClick(async () => {
                        confirmModal.close();
                        // Show the second, choice modal
                        new BulkCategorizeModal(this.app, async (choice, defaultCategory) => {
                          this.plugin.settings.enableAdvancedCategorization = true;
                          await this.plugin.saveData(this.plugin.settings);

                          await this.plugin.categorizationManager.bulkUpdateCategories(
                            choice,
                            defaultCategory
                          );

                          this.display(); // Re-render the settings tab
                        }).open();
                      })
                  )
                  .addButton(btn =>
                    btn.setButtonText('Cancel').onClick(() => confirmModal.close())
                  );

                confirmModal.open();
              } else {
                // Logic for turning the feature OFF
                const confirmModal = new Modal(this.app);
                // Add the same class for consistent styling
                confirmModal.modalEl.addClass('full-calendar-confirm-modal');

                const { contentEl } = confirmModal;

                contentEl.createEl('h2', { text: '⚠️ Disable and Clean Up' });

                contentEl.createEl('p', {
                  text: 'Disabling this feature will remove known category prefixes from your event titles to restore the previous format.'
                });

                // Use a highlighted div for the technical explanation
                const highlightEl = contentEl.createDiv('fc-confirm-highlight');
                const p1 = highlightEl.createEl('p');
                p1.innerHTML =
                  'For example, an event named <strong>"Work - My Meeting"</strong> will become <strong>"My Meeting"</strong> again.';

                const p2 = highlightEl.createEl('p');
                p2.innerHTML =
                  'This process will also <strong>permanently delete</strong> all of your saved category color settings.';

                contentEl.createEl('p', {
                  text: 'This action cannot be easily undone.'
                });

                const backupEl = contentEl.createEl('p');
                backupEl.innerHTML =
                  'It is <strong>STRONGLY RECOMMENDED</strong> to <strong>BACKUP</strong> your vault before continuing.';

                new Setting(contentEl)
                  .addButton(btn =>
                    btn
                      .setButtonText('Disable and Clean Up Notes')
                      .setWarning()
                      .onClick(async () => {
                        this.plugin.settings.enableAdvancedCategorization = false;
                        this.plugin.settings.categorySettings = [];
                        await this.plugin.saveData(this.plugin.settings);
                        await this.plugin.categorizationManager.bulkRemoveCategories();
                        confirmModal.close();
                        this.display();
                      })
                  )
                  .addButton(btn =>
                    btn.setButtonText('Cancel').onClick(() => confirmModal.close())
                  );

                confirmModal.open();
              }
            });
        });

      if (this.plugin.settings.enableAdvancedCategorization) {
        const categoryDiv = containerEl.createDiv();
        const categoryRoot = ReactDOM.createRoot(categoryDiv);

        const allCategoriesInVault = this.plugin.cache.getAllCategories();
        const configuredCategoryNames = new Set(
          this.plugin.settings.categorySettings.map(s => s.name)
        );
        const availableSuggestions = allCategoriesInVault.filter(
          cat => !configuredCategoryNames.has(cat)
        );

        categoryRoot.render(
          createElement(CategorySettingsManager, {
            settings: this.plugin.settings.categorySettings,
            suggestions: availableSuggestions,
            onSave: async newSettings => {
              this.plugin.settings.categorySettings = newSettings;
              await this.plugin.saveSettings();
            }
          })
        );
      }

      // ====================================================================
      // "What's New" Section
      // ====================================================================
      const whatsNewContainer = containerEl.createDiv('full-calendar-whats-new-container');
      const latestVersion = changelogData[0];

      const headerEl = whatsNewContainer.createDiv('full-calendar-whats-new-header');
      new Setting(headerEl).setName("What's new").setHeading();
      new Setting(headerEl).addExtraButton(button => {
        button
          .setIcon('ellipsis')
          .setTooltip('View full changelog')
          .onClick(() => {
            showFullChangelog = true;
            render();
          });
      });

      whatsNewContainer.createEl('p', {
        text: `Version ${latestVersion.version}`,
        cls: 'full-calendar-whats-new-version'
      });

      whatsNewContainer.createEl('hr', { cls: 'settings-view-new-divider' });

      const whatsNewList = whatsNewContainer.createDiv('full-calendar-whats-new-list');
      latestVersion.changes.forEach(change => {
        const item = new Setting(whatsNewList).setName(change.title).setDesc(change.description);

        // --- ICON INJECTION LOGIC (Corrected) ---
        const iconEl = createEl('span', { cls: `change-icon-settings change-type-${change.type}` });
        if (change.type === 'new') {
          iconEl.setText('+');
        } else if (change.type === 'improvement') {
          iconEl.setText('🔧');
        } else if (change.type === 'fix') {
          iconEl.setText('🐛');
        }

        // This is the key: We set the name first, which creates the DOM element,
        // and THEN we prepend our custom icon to that existing element.
        item.nameEl.prepend(iconEl);

        item.settingEl.addClass('full-calendar-whats-new-item');
        item.controlEl.empty();
      });

      // ====================================================================
      // Manage Calendars Section
      // ====================================================================
      new Setting(containerEl).setName('Manage calendars').setHeading();
      containerEl.createEl('hr', { cls: 'settings-view-new-divider' });
      const sourcesDiv = containerEl.createDiv();
      sourcesDiv.style.display = 'block';
      const calendarSettingsRef = createRef<CalendarSettings>();
      const root = ReactDOM.createRoot(sourcesDiv);
      root.render(
        <CalendarSettings
          ref={calendarSettingsRef}
          sources={this.plugin.settings.calendarSources}
          submit={async (settings: CalendarInfo[]) => {
            this.plugin.settings.calendarSources = settings;
            await this.plugin.saveSettings();
          }}
        />
      );
      addCalendarButton(
        this.plugin,
        containerEl,
        async (source: CalendarInfo) => {
          calendarSettingsRef.current?.addSource(source);
        },
        () => calendarSettingsRef.current?.getUsedDirectories() ?? []
      );

      // ====================================================================
      // Google Calendar Integration Section
      // ====================================================================
      new Setting(containerEl).setName('Google Calendar Integration').setHeading();

      new Setting(containerEl)
        .setName('Use custom Google Cloud credentials')
        .setDesc(
          'Use your own Google Cloud project for authentication. This is recommended for privacy and to avoid rate limits on the public client. Requires a plugin restart after changing.'
        )
        .addToggle(toggle => {
          toggle.setValue(this.plugin.settings.useCustomGoogleClient).onChange(async value => {
            // Changing the client invalidates any existing token.
            this.plugin.settings.googleAuth = null;
            this.plugin.settings.useCustomGoogleClient = value;
            await this.plugin.saveSettings();
            this.display(); // Re-render the tab
          });
        });

      if (this.plugin.settings.useCustomGoogleClient) {
        new Setting(containerEl).setName('Google Client ID').addText(text =>
          text
            .setPlaceholder('Enter your Client ID')
            .setValue(this.plugin.settings.googleClientId)
            .onChange(async value => {
              this.plugin.settings.googleClientId = value.trim();
              await this.plugin.saveData(this.plugin.settings);
            })
        );
        new Setting(containerEl).setName('Google Client Secret').addText(text =>
          text
            .setPlaceholder('Enter your Client Secret')
            .setValue(this.plugin.settings.googleClientSecret)
            .onChange(async value => {
              this.plugin.settings.googleClientSecret = value.trim();
              await this.plugin.saveData(this.plugin.settings);
            })
        );
      }

      new Setting(containerEl)
        .setName('Google Account')
        .setDesc(
          this.plugin.settings.googleAuth?.refreshToken
            ? 'Your account is connected.'
            : 'Connect your Google Account to add calendars.'
        )
        .addButton(button => {
          button
            .setButtonText(this.plugin.settings.googleAuth?.refreshToken ? 'Disconnect' : 'Connect')
            .onClick(async () => {
              if (this.plugin.settings.googleAuth?.refreshToken) {
                this.plugin.settings.googleAuth = null;
                await this.plugin.saveSettings();
                this.display();
              } else {
                startGoogleLogin(this.plugin);
              }
            });
        });

      // ====================================================================
      // Initial Setup Reminder
      // ====================================================================
      if (!this.plugin.settings.calendarSources.length) {
        const notice = containerEl.createDiv('full-calendar-initial-setup-notice');
        notice.createEl('h2', { text: 'Quick Start: Add Your First Calendar' });
        notice.createEl('p', {
          text: 'To begin using Full Calendar, add a calendar source. Click the "+" button in the "Manage calendars" section.'
        });
      }
    };

    render(); // Initial render
  }
}

/**
 * Ensures that every calendar source in an array has a persistent, unique ID.
 * If a source from a legacy settings file is missing an ID, it will be assigned one.
 * This is a non-destructive operation that prepares settings for use with the current version.
 * @param sources The array of calendar sources from a settings file.
 * @returns An object containing the updated sources array and a boolean indicating if any changes were made.
 */
export function ensureCalendarIds(sources: any[]): { updated: boolean; sources: CalendarInfo[] } {
  let updated = false;
  // Get all IDs that already exist to avoid creating duplicates.
  const existingIds: string[] = sources.map(s => s.id).filter(Boolean);

  const updatedSources = sources.map(source => {
    // If a source does not have an ID, it's a legacy source that needs one.
    if (!source.id) {
      updated = true;
      const newId = generateCalendarId(source.type, existingIds);
      // Add the new ID to our running list to ensure the NEXT generated ID is also unique within this loop.
      existingIds.push(newId);
      return { ...source, id: newId };
    }
    // If it already has an ID, return it unchanged.
    return source;
  });

  return { updated, sources: updatedSources as CalendarInfo[] };
}

/**
 * Ensures that the initial desktop view is valid. If advanced categorization is
 * disabled, but a timeline view is selected, it resets the view to a safe
 * default to prevent crashes.
 * @param settings The FullCalendarSettings object.
 * @returns The corrected settings object.
 */
export function sanitizeInitialView(settings: FullCalendarSettings): FullCalendarSettings {
  if (
    !settings.enableAdvancedCategorization &&
    settings.initialView.desktop.startsWith('resourceTimeline')
  ) {
    new Notice('Timeline view is disabled. Resetting default desktop view to "Week".', 5000);
    return {
      ...settings,
      initialView: {
        ...settings.initialView,
        desktop: 'timeGridWeek'
      }
    };
  }
  return settings;
}

class SelectGoogleCalendarsModal extends Modal {
  plugin: FullCalendarPlugin;
  calendars: any[];
  onSubmit: (selected: CalendarInfo[]) => void;
  googleCalendarSelection: Set<string>;

  constructor(
    plugin: FullCalendarPlugin,
    calendars: any[],
    onSubmit: (selected: CalendarInfo[]) => void
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.calendars = calendars;
    this.onSubmit = onSubmit;
    this.googleCalendarSelection = new Set();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Select Google Calendars to Add' });

    const existingGoogleCalendarIds = new Set(
      this.plugin.settings.calendarSources
        .filter(s => s.type === 'google')
        .map(s => (s as Extract<CalendarInfo, { type: 'google' }>).id)
    );

    this.calendars.forEach(cal => {
      if (!cal.id || existingGoogleCalendarIds.has(cal.id)) {
        return;
      }

      new Setting(contentEl)
        .setName(cal.summary || cal.id)
        .setDesc(cal.description || '')
        .addToggle(toggle =>
          toggle.onChange(value => {
            if (value) {
              this.googleCalendarSelection.add(cal.id);
            } else {
              this.googleCalendarSelection.delete(cal.id);
            }
          })
        );
    });

    new Setting(contentEl).addButton(button =>
      button
        .setButtonText('Add Selected Calendars')
        .setCta()
        .onClick(() => {
          const existingIds = this.plugin.settings.calendarSources.map(s => s.id);
          const existingColors = this.plugin.settings.calendarSources.map(s => s.color);

          const selectedCalendars = this.calendars
            .filter(cal => this.googleCalendarSelection.has(cal.id))
            .map(cal => {
              const newColor = getNextColor(existingColors);
              existingColors.push(newColor);

              const newCalendar: Extract<CalendarInfo, { type: 'google' }> = {
                type: 'google',
                id: cal.id,
                name: cal.summary,
                color: cal.backgroundColor || newColor
              };
              return newCalendar;
            });

          this.onSubmit(selectedCalendars);
          this.close();
        })
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
