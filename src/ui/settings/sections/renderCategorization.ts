/**
 * @file renderCategorization.ts
 * @brief Renders the advanced categorization settings section.
 * @license See LICENSE.md
 */

import { createElement } from 'react';
import { Setting, Modal } from 'obsidian';
import * as ReactDOM from 'react-dom/client';
import FullCalendarPlugin from '../../../main';
import { CategorySettingsManager } from '../components/CategorySetting';
import {
  bulkUpdateCategories,
  bulkRemoveCategories
} from '../../../features/category/bulkCategorization';

export function renderCategorizationSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  new Setting(containerEl).setName('Advanced categorization and Timeline').setHeading();
  const fragment = document.createDocumentFragment();
  fragment.appendText('Learn more ');
  fragment.createEl('a', {
    text: 'here',
    href: 'https://youfoundjk.github.io/plugin-full-calendar/events/categories'
  });
  fragment.appendText('.');
  const learnMoreP = containerEl.createEl('p', { cls: 'full-calendar-whats-new-version' });
  learnMoreP.appendChild(fragment);

  new Setting(containerEl)
    .setName('Enable advanced categorization (Title-based)')
    .setDesc(
      'Enable category-based coloring and unlock timeline views. This will modify event note titles and allow timeline visualization by category.'
    )
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.enableAdvancedCategorization).onChange(async value => {
        if (value) {
          // Logic for turning ON
          // LAZY LOAD MODAL
          const { BulkCategorizeModal } = await import('../../modals/BulkCategorizeModal');
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
          contentEl.createEl('h2', { text: '⚠️ Disable and clean up' });
          contentEl.createEl('p', {
            text: 'Disabling this feature will remove known category prefixes from your event titles and will permanently delete all saved category color settings.'
          });
          new Setting(contentEl)
            .addButton(btn =>
              btn
                .setButtonText('Disable and clean up notes')
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
              btn.setButtonText('Cancel').onClick(() => {
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
