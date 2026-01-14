import { App, Modal, Setting } from 'obsidian';
import * as ReactDOM from 'react-dom/client';
import { createElement } from 'react';
import { changelogData } from '../settings/changelogs/changelogData';
import { VersionSection } from '../settings/changelogs/Changelog';
import '../settings/changelogs/changelog.css';
import FullCalendarPlugin from '../../main';

export class WhatsNewModal extends Modal {
  private plugin: FullCalendarPlugin;

  constructor(app: App, plugin: FullCalendarPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('full-calendar-whats-new-modal');

    contentEl.createEl('h2', { text: "What's New in Full Calendar" });

    // Render the React component for the latest version
    const reactRootInfo = contentEl.createDiv('full-calendar-whats-new-react-root');
    const root = ReactDOM.createRoot(reactRootInfo);

    const latestVersion = changelogData[0];

    root.render(
      createElement(
        'div',
        {},
        createElement(VersionSection, {
          version: latestVersion,
          isInitiallyOpen: true,
          embedded: true
        })
      )
    );

    // Add "See all" button
    const footer = contentEl.createDiv('full-calendar-whats-new-footer');
    new Setting(footer)
      .addButton(btn =>
        btn.setButtonText('See all changelogs').onClick(async () => {
          this.close();
          // Open settings to changelog
          const settingsTab = this.plugin.settingsTab;
          if (settingsTab) {
            await settingsTab.showChangelog();
            // Open settings
            (this.plugin.app as any).setting.open();
            (this.plugin.app as any).setting.openTabById(this.plugin.manifest.id);
          }
        })
      )
      .addButton(btn =>
        btn
          .setButtonText('Close')
          .setCta()
          .onClick(() => {
            this.close();
          })
      );
  }

  onClose() {
    const { contentEl } = this;
    ReactDOM.createRoot(contentEl).unmount(); // Cleanup React
    contentEl.empty();
  }
}
