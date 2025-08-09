/**
 * @file WorkspaceModal.tsx
 * @brief Modal component for creating and editing workspace configurations.
 * @license See LICENSE.md
 */

import { Modal, Setting, DropdownComponent, TextComponent, ToggleComponent } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { buildSettingsToRuntimeIdMap, getRuntimeCalendarId } from '../../settings/utilsSettings';
import {
  WorkspaceSettings,
  generateWorkspaceId,
  BusinessHoursSettings
} from '../../../types/settings';

export class WorkspaceModal extends Modal {
  plugin: FullCalendarPlugin;
  workspace: WorkspaceSettings;
  isNew: boolean;
  onSave: (workspace: WorkspaceSettings) => void;

  // Form state
  private nameInput!: TextComponent;
  private desktopViewDropdown!: DropdownComponent;
  private mobileViewDropdown!: DropdownComponent;
  private defaultDateInput!: TextComponent;
  private visibleCalendarsContainer!: HTMLElement;
  private categoryFilterContainer!: HTMLElement;
  private businessHoursToggle!: ToggleComponent;
  private businessHoursContainer!: HTMLElement;
  private timelineExpandedToggle!: ToggleComponent;

  constructor(
    plugin: FullCalendarPlugin,
    workspace: WorkspaceSettings,
    isNew: boolean,
    onSave: (workspace: WorkspaceSettings) => void
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.workspace = { ...workspace }; // Create a copy to avoid mutating original
    this.isNew = isNew;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Modal title
    contentEl.createEl('h2', { text: this.isNew ? 'Create Workspace' : 'Edit Workspace' });

    this.renderGeneralSection(contentEl);
    this.renderViewSection(contentEl);
    this.renderCalendarFilterSection(contentEl);
    this.renderCategoryFilterSection(contentEl);
    this.renderAppearanceSection(contentEl);
    this.renderButtons(contentEl);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  private renderGeneralSection(containerEl: HTMLElement) {
    const section = containerEl.createEl('div', { cls: 'workspace-modal-section' });
    section.createEl('h3', { text: 'General' });

    // Workspace name
    new Setting(section)
      .setName('Name')
      .setDesc('A unique name for this workspace')
      .addText(text => {
        this.nameInput = text;
        text
          .setPlaceholder('e.g., Work Focus, Family Planning')
          .setValue(this.workspace.name || '')
          .onChange(value => {
            this.workspace.name = value;
          });
      });
  }

  private renderViewSection(containerEl: HTMLElement) {
    const section = containerEl.createEl('div', { cls: 'workspace-modal-section' });
    section.createEl('h3', { text: 'View Configuration' });

    // Desktop view
    const desktopViewOptions: { [key: string]: string } = {
      '': 'Use default',
      timeGridDay: 'Day',
      timeGridWeek: 'Week',
      dayGridMonth: 'Month',
      listWeek: 'List'
    };

    if (this.plugin.settings.enableAdvancedCategorization) {
      desktopViewOptions['resourceTimelineWeek'] = 'Timeline Week';
      desktopViewOptions['resourceTimelineDay'] = 'Timeline Day';
    }

    new Setting(section)
      .setName('Desktop view')
      .setDesc('Default view for desktop devices')
      .addDropdown(dropdown => {
        this.desktopViewDropdown = dropdown;
        Object.entries(desktopViewOptions).forEach(([value, display]) => {
          dropdown.addOption(value, display);
        });
        dropdown.setValue(this.workspace.defaultView?.desktop || '');
        dropdown.onChange(value => {
          if (!this.workspace.defaultView) this.workspace.defaultView = {};
          this.workspace.defaultView.desktop = value || undefined;
        });
      });

    // Mobile view
    const mobileViewOptions: { [key: string]: string } = {
      '': 'Use default',
      timeGrid3Days: '3 Days',
      timeGridDay: 'Day',
      listWeek: 'List'
    };

    new Setting(section)
      .setName('Mobile view')
      .setDesc('Default view for mobile devices')
      .addDropdown(dropdown => {
        this.mobileViewDropdown = dropdown;
        Object.entries(mobileViewOptions).forEach(([value, display]) => {
          dropdown.addOption(value, display);
        });
        dropdown.setValue(this.workspace.defaultView?.mobile || '');
        dropdown.onChange(value => {
          if (!this.workspace.defaultView) this.workspace.defaultView = {};
          this.workspace.defaultView.mobile = value || undefined;
        });
      });

    // Default date
    new Setting(section)
      .setName('Default date (optional)')
      .setDesc('Date to jump to when activating workspace (e.g., "today", "2024-01-01")')
      .addText(text => {
        this.defaultDateInput = text;
        text
          .setPlaceholder('today, next-week, 2024-01-01')
          .setValue(this.workspace.defaultDate || '')
          .onChange(value => {
            this.workspace.defaultDate = value || undefined;
          });
      });
  }

  private renderCalendarFilterSection(containerEl: HTMLElement) {
    const section = containerEl.createEl('div', { cls: 'workspace-modal-section' });
    section.createEl('h3', { text: 'Calendar Filters' });

    // Get available calendars
    const calendars = this.plugin.settings.calendarSources;

    if (calendars.length === 0) {
      section.createEl('p', {
        text: 'No calendars configured. Configure calendars in the main settings first.'
      });
      return;
    }

    // Visible calendars
    new Setting(section)
      .setName('Visible calendars')
      .setDesc('Select which calendars to show (leave empty to show all)')
      .setClass('workspace-calendar-filter');

    this.visibleCalendarsContainer = section.createEl('div', {
      cls: 'workspace-calendar-checkboxes'
    });
    this.renderCalendarCheckboxes(this.visibleCalendarsContainer, calendars);
  }

  private renderCalendarCheckboxes(container: HTMLElement, calendars: any[]) {
    const selectedIds = (this.workspace.visibleCalendars || []).map(String);
    const idMap = buildSettingsToRuntimeIdMap(this.plugin.settings.calendarSources);

    calendars.forEach(calendar => {
      const checkboxContainer = container.createEl('div', { cls: 'workspace-checkbox-item' });

      // Generate a meaningful display name based on calendar type
      let displayName = calendar.name;
      if (!displayName || displayName.trim() === '') {
        switch (calendar.type) {
          case 'local':
            displayName = `Local: ${calendar.directory}`;
            break;
          case 'dailynote':
            displayName = `Daily Notes: ${calendar.heading}`;
            break;
          case 'ical':
            try {
              displayName = `ICS: ${new URL(calendar.url).hostname}`;
            } catch (_) {
              displayName = 'ICS Calendar';
            }
            break;
          case 'caldav':
            try {
              displayName = `CalDAV: ${new URL(calendar.url).hostname}`;
            } catch (_) {
              displayName = 'CalDAV Calendar';
            }
            break;
          case 'google':
            displayName = `Google Calendar`;
            break;
          default:
            displayName = `${calendar.type} Calendar`;
        }
      }

      new Setting(checkboxContainer).setName(displayName).addToggle(toggle => {
        // Prefer runtime id for selection, fallback to settings id
        const runtimeId = getRuntimeCalendarId(calendar);
        const settingsId = String(calendar.id);
        const currentId = selectedIds.find(id => id === runtimeId || id === settingsId);
        toggle.setValue(!!currentId);
        toggle.onChange(checked => {
          const currentList = (this.workspace.visibleCalendars || []).map(String);
          const idToUse = runtimeId; // Store runtime ids going forward

          if (checked) {
            if (!currentList.includes(idToUse)) {
              const newList = [...currentList, idToUse];
              this.workspace.visibleCalendars = newList;
            }
          } else {
            // Remove both potential forms to keep data clean
            const newList = currentList.filter(id => id !== idToUse && id !== settingsId);
            this.workspace.visibleCalendars = newList.length > 0 ? newList : undefined;
          }
        });
      });
    });
  }

  private renderCategoryFilterSection(containerEl: HTMLElement) {
    const section = containerEl.createEl('div', { cls: 'workspace-modal-section' });
    section.createEl('h3', { text: 'Category Filters' });

    if (!this.plugin.settings.enableAdvancedCategorization) {
      section.createEl('p', {
        text: 'Category filtering requires Advanced Categorization to be enabled in the main settings.'
      });
      return;
    }

    // Ensure there is always a category filter object; empty selection means show all
    if (!this.workspace.categoryFilter) {
      this.workspace.categoryFilter = { mode: 'show-only', categories: [] };
    }

    // Category filter mode
    new Setting(section)
      .setName('Category filter mode')
      .setDesc('Choose how to filter categories')
      .addDropdown(dropdown => {
        dropdown.addOption('show-only', 'Show only selected categories');
        dropdown.addOption('hide', 'Hide selected categories');

        dropdown.setValue(this.workspace.categoryFilter?.mode ?? 'show-only');
        dropdown.onChange(value => {
          // Mode is always defined now; empty categories means show-all implicitly
          this.workspace.categoryFilter = this.workspace.categoryFilter || {
            mode: 'show-only',
            categories: []
          };
          this.workspace.categoryFilter.mode = value as 'show-only' | 'hide';
          this.renderCategoryCheckboxes();
        });
      });

    // Hint for selection semantics
    new Setting(section)
      .setName('Categories')
      .setDesc('Select categories to include/exclude (leave empty to show all)');

    this.categoryFilterContainer = section.createEl('div', {
      cls: 'workspace-category-checkboxes'
    });
    this.renderCategoryCheckboxes();
  }

  private renderCategoryCheckboxes() {
    this.categoryFilterContainer.empty();
    // Ensure filter object exists so checkboxes always render
    if (!this.workspace.categoryFilter) {
      this.workspace.categoryFilter = { mode: 'show-only', categories: [] };
    }

    const categories = this.plugin.settings.categorySettings;
    if (categories.length === 0) {
      this.categoryFilterContainer.createEl('p', {
        text: 'No categories configured. Configure categories in the Categorization settings.'
      });
      return;
    }

    categories.forEach(category => {
      const checkboxContainer = this.categoryFilterContainer.createEl('div', {
        cls: 'workspace-checkbox-item'
      });

      new Setting(checkboxContainer).setName(category.name).addToggle(toggle => {
        toggle.setValue((this.workspace.categoryFilter?.categories || []).includes(category.name));
        toggle.onChange(checked => {
          if (!this.workspace.categoryFilter) return;

          const current = this.workspace.categoryFilter.categories || [];
          if (checked) {
            if (!current.includes(category.name)) {
              this.workspace.categoryFilter.categories = [...current, category.name];
            }
          } else {
            this.workspace.categoryFilter.categories = current.filter(
              name => name !== category.name
            );
          }
        });
      });
    });
  }

  private renderAppearanceSection(containerEl: HTMLElement) {
    const section = containerEl.createEl('div', { cls: 'workspace-modal-section' });
    section.createEl('h3', { text: 'Appearance Overrides' });

    // Business hours override
    new Setting(section)
      .setName('Override business hours')
      .setDesc('Enable custom business hours for this workspace')
      .addToggle(toggle => {
        this.businessHoursToggle = toggle;
        const hasOverride = !!this.workspace.businessHours;
        toggle.setValue(hasOverride);
        toggle.onChange(value => {
          if (value) {
            // Initialize with default business hours if enabling
            this.workspace.businessHours = {
              enabled: true,
              daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
              startTime: '09:00',
              endTime: '17:00'
            };
          } else {
            this.workspace.businessHours = undefined;
          }
          this.renderBusinessHoursDetails();
        });
      });

    this.businessHoursContainer = section.createEl('div', {
      cls: 'workspace-business-hours-details'
    });
    this.renderBusinessHoursDetails();

    // Timeline expanded
    if (this.plugin.settings.enableAdvancedCategorization) {
      new Setting(section)
        .setName('Timeline categories')
        .setDesc('Default state for timeline category groups')
        .addDropdown(dropdown => {
          dropdown.addOption('', 'Use default setting');
          dropdown.addOption('true', 'Expanded by default');
          dropdown.addOption('false', 'Collapsed by default');

          const currentValue = this.workspace.timelineExpanded;
          dropdown.setValue(currentValue === undefined ? '' : currentValue.toString());
          dropdown.onChange(value => {
            this.workspace.timelineExpanded = value === '' ? undefined : value === 'true';
          });
        });
    }
  }

  private renderBusinessHoursDetails() {
    this.businessHoursContainer.empty();

    if (!this.workspace.businessHours) return;

    // Enabled toggle
    new Setting(this.businessHoursContainer)
      .setName('Enable business hours')
      .setDesc('Show business hours highlighting in this workspace')
      .addToggle(toggle => {
        toggle.setValue(this.workspace.businessHours?.enabled || false);
        toggle.onChange(value => {
          if (this.workspace.businessHours) {
            this.workspace.businessHours.enabled = value;
            this.renderBusinessHoursDetails(); // Re-render to show/hide dependent settings
          }
        });
      })
      .settingEl.addClass('fc-indented-setting');

    if (this.workspace.businessHours.enabled) {
      // Business days
      new Setting(this.businessHoursContainer)
        .setName('Business days')
        .setDesc('Select which days of the week are business days')
        .addDropdown(dropdown => {
          dropdown
            .addOption('1,2,3,4,5', 'Monday - Friday')
            .addOption('0,1,2,3,4,5,6', 'Every day')
            .addOption('1,2,3,4', 'Monday - Thursday')
            .addOption('2,3,4,5,6', 'Tuesday - Saturday');

          const currentDays = this.workspace.businessHours?.daysOfWeek.join(',') || '1,2,3,4,5';
          dropdown.setValue(currentDays);
          dropdown.onChange(value => {
            if (this.workspace.businessHours) {
              this.workspace.businessHours.daysOfWeek = value.split(',').map(Number);
            }
          });
        })
        .settingEl.addClass('fc-indented-setting');

      // Start time
      new Setting(this.businessHoursContainer)
        .setName('Business hours start time')
        .setDesc('When your working day begins (format: HH:mm)')
        .addText(text => {
          text.setValue(this.workspace.businessHours?.startTime || '09:00');
          text.onChange(value => {
            if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value) && this.workspace.businessHours) {
              this.workspace.businessHours.startTime = value;
            }
          });
        })
        .settingEl.addClass('fc-indented-setting');

      // End time
      new Setting(this.businessHoursContainer)
        .setName('Business hours end time')
        .setDesc('When your working day ends (format: HH:mm)')
        .addText(text => {
          text.setValue(this.workspace.businessHours?.endTime || '17:00');
          text.onChange(value => {
            if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value) && this.workspace.businessHours) {
              this.workspace.businessHours.endTime = value;
            }
          });
        })
        .settingEl.addClass('fc-indented-setting');
    }
  }

  private renderButtons(containerEl: HTMLElement) {
    const buttonContainer = containerEl.createEl('div', { cls: 'workspace-modal-buttons' });

    // Cancel button
    buttonContainer.createEl('button', { text: 'Cancel' }, button => {
      button.addEventListener('click', () => {
        this.close();
      });
    });

    // Save button
    buttonContainer.createEl(
      'button',
      { text: this.isNew ? 'Create' : 'Save', cls: 'mod-cta' },
      button => {
        button.addEventListener('click', () => {
          if (this.validateWorkspace()) {
            // Normalize data before persisting to avoid runtime mismatches
            if (this.workspace.visibleCalendars?.length) {
              // Normalize to runtime ids for consistency
              const idMap = buildSettingsToRuntimeIdMap(this.plugin.settings.calendarSources);
              this.workspace.visibleCalendars = this.workspace.visibleCalendars
                .map(String)
                .map(id => idMap.get(id) || id);
            }
            if (this.workspace.categoryFilter) {
              const deduped = Array.from(new Set(this.workspace.categoryFilter.categories || []));
              this.workspace.categoryFilter.categories = deduped;
            }

            this.onSave(this.workspace);
            this.close();
          }
        });
      }
    );
  }

  private validateWorkspace(): boolean {
    if (!this.workspace.name || this.workspace.name.trim() === '') {
      // Focus the name input if it's empty
      this.nameInput.inputEl.focus();
      return false;
    }

    // Ensure we have a valid ID
    if (!this.workspace.id) {
      this.workspace.id = generateWorkspaceId();
    }

    return true;
  }
}
