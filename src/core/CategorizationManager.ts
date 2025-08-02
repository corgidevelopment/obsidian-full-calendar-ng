/**
 * @file CategorizationManager.ts
 * @brief Manages bulk categorization operations for editable calendars.
 *
 * @description
 * This service class orchestrates the process of adding or removing categories
 * from event titles across all configured editable calendars. It acts as a

 * single point of contact for the UI, abstracting away the specific
 * implementation details of how each calendar type (e.g., note-based vs.
 * daily-note-based) handles file modifications.
 *
 * @see EditableCalendar.ts
 *
 * @license See LICENSE.md
 */

import { Notice } from 'obsidian';
import { EditableCalendar, CategoryProvider } from '../calendars/EditableCalendar';
import FullNoteCalendar from '../calendars/FullNoteCalendar';
import FullCalendarPlugin from '../main';
import { EventLocation, OFCEvent } from '../types';

export class CategorizationManager {
  private plugin: FullCalendarPlugin;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  private getEditableCalendars(): EditableCalendar[] {
    return [...this.plugin.cache.calendars.values()].flatMap(c =>
      c instanceof EditableCalendar ? [c] : []
    );
  }

  private async performBulkOperation(operation: () => Promise<void>): Promise<void> {
    if (this.plugin.cache.isBulkUpdating) {
      new Notice('A bulk update is already in progress.');
      return;
    }

    this.plugin.cache.isBulkUpdating = true;
    try {
      await operation();
    } catch (e) {
      console.error('Error during bulk operation:', e);
      new Notice('An error occurred during the bulk update. See console for details.');
    } finally {
      this.plugin.cache.isBulkUpdating = false;
      // After the update is complete, we must trigger a full cache refresh.
      // saveSettings is the canonical way to trigger a full cache reset and view reload.
      await this.plugin.saveSettings();
    }
  }

  public async bulkUpdateCategories(
    choice: 'smart' | 'force_folder' | 'force_default',
    defaultCategory?: string
  ): Promise<void> {
    await this.performBulkOperation(async () => {
      const categoryProvider: CategoryProvider = (event: OFCEvent, location: EventLocation) => {
        if (choice === 'force_default') {
          return defaultCategory;
        }
        // For both 'smart' and 'force_folder', the category comes from the parent folder.
        const parent = this.plugin.app.vault.getAbstractFileByPath(location.file.path)?.parent;
        if (!parent || parent.isRoot()) {
          return undefined;
        }
        return parent.name;
      };

      const force = choice !== 'smart';
      const editableCalendars = this.getEditableCalendars();

      // CORRECTED: Use a for...of loop for async operations.
      for (const calendar of editableCalendars) {
        await calendar.bulkAddCategories(categoryProvider, force);
      }
    });
  }

  public async bulkRemoveCategories(): Promise<void> {
    await this.performBulkOperation(async () => {
      // The manager is ONLY responsible for gathering categories from the settings.
      const settings = this.plugin.settings;
      const knownCategories = new Set<string>(
        settings.categorySettings.map((s: { name: string }) => s.name)
      );

      const editableCalendars = this.getEditableCalendars();
      for (const calendar of editableCalendars) {
        const folderCategories = calendar.getFolderCategoryNames();
        if (folderCategories.length > 0) {
          for (const name of folderCategories) {
            knownCategories.add(name);
          }
        }
      }
      for (const calendar of editableCalendars) {
        await calendar.bulkRemoveCategories(knownCategories);
      }
    });
  }
}
