/**
 * @file renderWhatsNew.ts
 * @brief Renders the "What's New" section using native Obsidian components.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import { changelogData } from './changelogData';
import './changelog.css';
import { t } from '../../../features/i18n/i18n';
import FullCalendarPlugin from '../../../main';
import { WhatsNewModal } from '../../modals/WhatsNewModal';

/**
 * Checks if the plugin version has changed and displays the "What's New" modal if necessary.
 * This should be called after settings are loaded.
 */
export async function checkAndShowWhatsNew(plugin: FullCalendarPlugin): Promise<void> {
  const latestVersion = changelogData[0].version;

  // Defer to onLayoutReady to ensure the UI is initialized before showing the modal
  plugin.app.workspace.onLayoutReady(async () => {
    if (
      plugin.settings.currentVersion === null ||
      plugin.settings.currentVersion !== latestVersion
    ) {
      new WhatsNewModal(plugin.app, plugin).open();

      // Update the persisted version
      plugin.settings.currentVersion = latestVersion;
      await plugin.saveSettings();
    }
  });
}

export function renderWhatsNew(containerEl: HTMLElement, onShowChangelog: () => void): void {
  const whatsNewContainer = containerEl.createDiv('full-calendar-whats-new-container');
  const latestVersion = changelogData[0];

  const headerEl = whatsNewContainer.createDiv('full-calendar-whats-new-header');
  new Setting(headerEl).setName(t('settings.changelog.whatsNew')).setHeading();
  new Setting(headerEl).addExtraButton(button => {
    button
      .setIcon('ellipsis')
      .setTooltip(t('settings.changelog.viewFull'))
      .onClick(onShowChangelog);
  });

  whatsNewContainer.createEl('p', {
    text: `Version ${latestVersion.version}`,
    cls: 'full-calendar-whats-new-version'
  });

  whatsNewContainer.createEl('hr', { cls: 'settings-view-new-divider' });

  const whatsNewList = whatsNewContainer.createDiv('full-calendar-whats-new-list');
  latestVersion.changes.forEach(change => {
    const item = new Setting(whatsNewList).setName(change.title).setDesc(change.description);

    const iconEl = createEl('span', { cls: `change-icon-settings change-type-${change.type}` });
    if (change.type === 'new') {
      iconEl.setText('+');
    } else if (change.type === 'improvement') {
      iconEl.setText('🔧');
    } else if (change.type === 'fix') {
      iconEl.setText('🐛');
    }

    item.nameEl.prepend(iconEl);
    item.settingEl.addClass('full-calendar-whats-new-item');
    item.controlEl.empty();
  });
}
