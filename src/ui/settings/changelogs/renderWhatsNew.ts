/**
 * @file renderWhatsNew.ts
 * @brief Renders the "What's New" section using native Obsidian components.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import { changelogData } from './changelogData';
import './changelog.css';

export function renderWhatsNew(containerEl: HTMLElement, onShowChangelog: () => void): void {
  const whatsNewContainer = containerEl.createDiv('full-calendar-whats-new-container');
  const latestVersion = changelogData[0];

  const headerEl = whatsNewContainer.createDiv('full-calendar-whats-new-header');
  new Setting(headerEl).setName("What's new").setHeading();
  new Setting(headerEl).addExtraButton(button => {
    button.setIcon('ellipsis').setTooltip('View full changelog').onClick(onShowChangelog);
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
