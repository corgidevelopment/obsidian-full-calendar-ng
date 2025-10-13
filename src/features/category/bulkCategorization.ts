/**
 * @file bulkCategorization.ts
 * @brief Provides stateless bulk action functions for managing event categories.
 *
 * @description
 * This module contains self-contained, stateless functions that perform bulk
 * modifications on files for the "Advanced Categorization" feature. These
 * actions are invoked directly by the UI, accept the plugin instance to access
 * settings and the Vault, and operate on files without any knowledge of the
 * EventCache or providers.
 *
 * @license See LICENSE.md
 */

import { Notice, TFile, TFolder } from 'obsidian';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';

import FullCalendarPlugin from '../../main';
import { OFCEvent } from '../../types';
import {
  getInlineEventFromLine,
  getListsUnderHeading,
  modifyListItem
} from '../../providers/dailynote/parser_dailyN';
import { constructTitle, parseTitle } from './categoryParser';
import { validateEvent } from '../../types/schema';
import { t } from '../i18n/i18n';

type CategoryProvider = (file: TFile) => string | undefined;

/**
 * Gathers all TFile objects from local and daily note calendar sources.
 */
async function getFilesToProcess(plugin: FullCalendarPlugin): Promise<TFile[]> {
  const files = new Set<TFile>();

  // 1. Get files from 'local' (Full Note) providers
  const localSources = plugin.settings.calendarSources.filter(
    (s): s is Extract<(typeof plugin.settings.calendarSources)[number], { type: 'local' }> =>
      s.type === 'local'
  );
  for (const source of localSources) {
    const eventFolder = plugin.app.vault.getAbstractFileByPath(source.directory);
    if (eventFolder instanceof TFolder) {
      const addFilesRecursively = (folder: TFolder) => {
        for (const child of folder.children) {
          if (child instanceof TFile) {
            files.add(child);
          } else if (child instanceof TFolder) {
            addFilesRecursively(child);
          }
        }
      };
      addFilesRecursively(eventFolder);
    }
  }

  // 2. Get files from 'dailynote' providers
  const dailyNoteSources = plugin.settings.calendarSources.filter(s => s.type === 'dailynote');
  if (dailyNoteSources.length > 0) {
    const { folder } = getDailyNoteSettings();
    if (folder) {
      const dailyNotesFolder = plugin.app.vault.getAbstractFileByPath(folder);
      if (dailyNotesFolder instanceof TFolder) {
        for (const file of dailyNotesFolder.children) {
          if (file instanceof TFile) {
            files.add(file);
          }
        }
      }
    }
  }

  return Array.from(files);
}

/**
 * Performs a one-time bulk update to add category prefixes to event titles.
 */
export async function bulkUpdateCategories(
  plugin: FullCalendarPlugin,
  choice: 'smart' | 'force_folder' | 'force_default',
  defaultCategory?: string
): Promise<void> {
  const categoryProvider: CategoryProvider = (file: TFile) => {
    if (choice === 'force_default') {
      return defaultCategory;
    }
    // For both 'smart' and 'force_folder', the category comes from the parent folder.
    if (!file.parent || file.parent.isRoot()) {
      return undefined;
    }
    return file.parent.name;
  };

  const force = choice !== 'smart';
  const files = await getFilesToProcess(plugin);
  if (files.length === 0) {
    new Notice(t('notices.bulkCategorization.noNotesFound'));
    return;
  }

  // Processor for Full Note calendars
  const fullNoteProcessor = async (file: TFile) => {
    await plugin.app.fileManager.processFrontMatter(file, frontmatter => {
      const event = validateEvent(frontmatter);
      if (!event || !event.title) return;

      const { category: existingCategory, title: cleanTitle } = parseTitle(event.title);
      if (existingCategory && !force) return;

      const newCategory = categoryProvider(file);
      if (!newCategory) return;

      const titleToCategorize = force ? event.title : cleanTitle;
      frontmatter.title = constructTitle(newCategory, undefined, titleToCategorize);
    });
  };

  // Processor for Daily Note calendars
  const dailyNoteProcessor = async (file: TFile) => {
    const dailyNoteSources = plugin.settings.calendarSources.filter(s => s.type === 'dailynote');
    await plugin.app.vault.process(file, content => {
      const metadata = plugin.app.metadataCache.getFileCache(file);
      if (!metadata) return content;

      const lines = content.split('\n');
      let modified = false;

      for (const source of dailyNoteSources) {
        const listItems = getListsUnderHeading(source.heading, metadata);
        if (listItems.length === 0) continue;

        for (const item of listItems) {
          const lineNumber = item.position.start.line;
          const line = lines[lineNumber];
          const existingEvent = getInlineEventFromLine(line, {});
          if (!existingEvent) continue;

          const { category: existingCategory } = parseTitle(existingEvent.title);
          if (existingCategory && !force) continue;

          const newCategory = categoryProvider(file);
          if (!newCategory) continue;

          const rawTitle = line
            .replace(/^(\s*)\-\s+(\[(.)\]\s+)?/, '')
            .replace(/\s*\[.*?\]\s*/g, '')
            .trim();
          const titleToCategorize = force ? rawTitle : existingEvent.title;
          const newFullTitle = constructTitle(newCategory, undefined, titleToCategorize);

          const {
            category: finalCategory,
            subCategory: finalSubCategory,
            title: finalTitle
          } = parseTitle(newFullTitle);

          const eventWithNewCategory: OFCEvent = {
            ...existingEvent,
            title: finalTitle,
            category: finalCategory,
            subCategory: finalSubCategory
          };

          const newLine = modifyListItem(line, eventWithNewCategory, plugin.settings);
          if (newLine) {
            lines[lineNumber] = newLine;
            modified = true;
          }
        }
      }
      return modified ? lines.join('\n') : content;
    });
  };

  // Combined processor
  const combinedProcessor = async (file: TFile) => {
    await fullNoteProcessor(file);
    await dailyNoteProcessor(file);
  };

  await plugin.nonBlockingProcess(files, combinedProcessor, 'Categorizing event notes');
  new Notice(t('notices.bulkCategorization.complete'));
}

/**
 * Performs a one-time bulk update to remove known category prefixes from event titles.
 */
export async function bulkRemoveCategories(plugin: FullCalendarPlugin): Promise<void> {
  const knownCategories = new Set<string>(
    plugin.settings.categorySettings.map((s: { name: string }) => s.name)
  );
  const files = await getFilesToProcess(plugin);
  if (files.length === 0) {
    new Notice(t('notices.bulkDecategorization.noNotesFound'));
    return;
  }

  // Processor for Full Note calendars
  const fullNoteProcessor = async (file: TFile) => {
    // Add parent folder to categories to remove
    const parentDir = file.parent?.name;
    if (parentDir) knownCategories.add(parentDir);

    await plugin.app.fileManager.processFrontMatter(file, frontmatter => {
      if (!frontmatter.title) return;
      const { category, title: cleanTitle } = parseTitle(frontmatter.title);
      if (category && knownCategories.has(category)) {
        frontmatter.title = cleanTitle;
      }
    });
  };

  // Processor for Daily Note calendars
  const dailyNoteProcessor = async (file: TFile) => {
    // Add parent folder to categories to remove
    const { folder } = getDailyNoteSettings();
    const parentDir = folder
      ?.split('/')
      .filter(s => s)
      .pop();
    if (parentDir) knownCategories.add(parentDir);

    const dailyNoteSources = plugin.settings.calendarSources.filter(s => s.type === 'dailynote');
    await plugin.app.vault.process(file, content => {
      const metadata = plugin.app.metadataCache.getFileCache(file);
      if (!metadata) return content;

      const lines = content.split('\n');
      let modified = false;

      for (const source of dailyNoteSources) {
        const listItems = getListsUnderHeading(source.heading, metadata);
        if (listItems.length === 0) continue;

        for (const item of listItems) {
          const lineNumber = item.position.start.line;
          const line = lines[lineNumber];
          const eventWithCategory = getInlineEventFromLine(line, {});
          if (!eventWithCategory) continue;

          const { category, title: cleanTitle } = parseTitle(eventWithCategory.title);
          if (!category || !knownCategories.has(category)) continue;

          const eventWithoutCategory: OFCEvent = {
            ...eventWithCategory,
            title: cleanTitle,
            category: undefined
          };
          const newLine = modifyListItem(line, eventWithoutCategory, plugin.settings);

          if (newLine && newLine !== line) {
            lines[lineNumber] = newLine;
            modified = true;
          }
        }
      }
      return modified ? lines.join('\n') : content;
    });
  };

  // Combined processor
  const combinedProcessor = async (file: TFile) => {
    await fullNoteProcessor(file);
    await dailyNoteProcessor(file);
  };

  await plugin.nonBlockingProcess(files, combinedProcessor, 'De-categorizing event notes');
  new Notice(t('notices.bulkDecategorization.complete'));
}
