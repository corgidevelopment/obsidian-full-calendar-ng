/**
 * @file renderCategorization.ts
 * @brief Renders the advanced categorization settings section.
 * @license See LICENSE.md
 */

import { createElement } from 'react';
import { Setting, Modal } from 'obsidian';
import * as ReactDOM from 'react-dom/client';
import FullCalendarPlugin from '../../../main';
import { BulkCategorizeModal } from '../../modals/BulkCategorizeModal';
import { CategorySettingsManager } from '../components/CategorySetting';

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
  containerEl.createEl('p', {
    text: fragment,
    cls: 'full-calendar-whats-new-version'
  });

  new Setting(containerEl)
    .setName('Enable advanced categorization (Title-based)')
    .setDesc(
      'Enable category-based coloring and unlock timeline views. This will modify event note titles and allow timeline visualization by category.'
    )
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.enableAdvancedCategorization).onChange(async value => {
        if (value) {
          // Logic for turning ON
          new BulkCategorizeModal(plugin.app, async (choice, defaultCategory) => {
            plugin.settings.enableAdvancedCategorization = true;
            await plugin.saveData(plugin.settings);
            await plugin.categorizationManager.bulkUpdateCategories(choice, defaultCategory);
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
                  await plugin.categorizationManager.bulkRemoveCategories();
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
