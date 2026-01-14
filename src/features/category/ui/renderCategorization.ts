/**
 * @file renderCategorization.ts
 * @brief Renders the advanced categorization settings section.
 * @license See LICENSE.md
 */

import { createElement } from 'react';
import { Setting, Modal } from 'obsidian';
import * as ReactDOM from 'react-dom/client';
import FullCalendarPlugin from '../../../main';
import { CategorySettingsManager } from './CategorySetting';
import { bulkUpdateCategories, bulkRemoveCategories } from '../bulkCategorization';
import { t } from '../../i18n/i18n';

export function renderCategorizationSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  const fragment = document.createDocumentFragment();
  fragment.appendText(`${t('settings.categorization.learnMore')} `);
  fragment.createEl('a', {
    text: t('settings.categorization.learnMoreLink'),
    href: 'https://youfoundjk.github.io/plugin-full-calendar/events/categories'
  });
  fragment.appendText('.');

  new Setting(containerEl)
    .setName(t('settings.categorization.title'))
    .setHeading()
    .setDesc(fragment);

  new Setting(containerEl)
    .setName(t('settings.categorization.enable.label'))
    .setDesc(t('settings.categorization.enable.description'))
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.enableAdvancedCategorization).onChange(async value => {
        if (value) {
          // Logic for turning ON
          // LAZY LOAD MODAL
          const { BulkCategorizeModal } = await import('./BulkCategorizeModal');
          new BulkCategorizeModal(plugin.app, async (choice, defaultCategory) => {
            plugin.settings.enableAdvancedCategorization = true;
            await plugin.saveData(plugin.settings);
            await bulkUpdateCategories(plugin, choice, defaultCategory);
            rerender();
          }).open();
        } else {
          // Logic for turning OFF
          const confirmModal = new Modal(plugin.app);
          confirmModal.modalEl.addClass('full-calendar-confirm-modal');
          const { contentEl } = confirmModal;
          contentEl.createEl('h2', { text: t('settings.categorization.disable.modalTitle') });
          contentEl.createEl('p', {
            text: t('settings.categorization.disable.modalDescription')
          });
          new Setting(contentEl)
            .addButton(btn =>
              btn
                .setButtonText(t('settings.categorization.disable.buttonDisable'))
                .setWarning()
                .onClick(async () => {
                  plugin.settings.enableAdvancedCategorization = false;
                  plugin.settings.categorySettings = [];
                  await plugin.saveData(plugin.settings);
                  await bulkRemoveCategories(plugin);
                  confirmModal.close();
                  rerender();
                })
            )
            .addButton(btn =>
              btn.setButtonText(t('settings.categorization.disable.buttonCancel')).onClick(() => {
                toggle.setValue(true); // Revert toggle state if cancelled
                confirmModal.close();
              })
            );
          confirmModal.open();
        }
      });
    });

  if (plugin.settings.enableAdvancedCategorization) {
    const categoryDiv = containerEl.createDiv();
    const categoryRoot = ReactDOM.createRoot(categoryDiv);

    const allCategoriesInVault = plugin.cache.getAllCategories();
    const configuredCategoryNames = new Set(plugin.settings.categorySettings.map(s => s.name));
    const availableSuggestions = allCategoriesInVault.filter(
      cat => !configuredCategoryNames.has(cat)
    );

    categoryRoot.render(
      createElement(CategorySettingsManager, {
        settings: plugin.settings.categorySettings,
        suggestions: availableSuggestions,
        onSave: async newSettings => {
          plugin.settings.categorySettings = newSettings;
          await plugin.saveSettings();
        }
      })
    );
  }
}
