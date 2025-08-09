/**
 * @file LazySettingsTab.ts
 * @brief Lightweight wrapper for lazy-loading the heavy SettingsTab component.
 *
 * @description
 * This wrapper implements the PluginSettingTab interface but defers loading
 * the actual FullCalendarSettingTab until it's needed. This prevents the
 * heavy React/settings dependencies from being loaded during plugin startup,
 * significantly improving Obsidian's startup performance.
 */

import { App, PluginSettingTab } from 'obsidian';
import type FullCalendarPlugin from '../../main';
import type { FullCalendarSettingTab } from './SettingsTab';

export class LazySettingsTab extends PluginSettingTab {
  private actualTab?: FullCalendarSettingTab;
  private plugin: FullCalendarPlugin;

  constructor(app: App, plugin: FullCalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * Lazy-loads the actual SettingsTab when first accessed.
   */
  private async ensureActualTab(): Promise<FullCalendarSettingTab> {
    if (!this.actualTab) {
      const { FullCalendarSettingTab } = await import('./SettingsTab');
      this.actualTab = new FullCalendarSettingTab(this.app, this.plugin);
    }
    return this.actualTab;
  }

  async display(): Promise<void> {
    const tab = await this.ensureActualTab();
    // Use the container provided by Obsidian for this (lazy) tab
    // so the heavy tab renders into the correct element.
    (tab as any).containerEl = this.containerEl;
    return tab.display();
  }

  hide(): void {
    // Only call hide if the tab has been loaded
    this.actualTab?.hide();
  }
}
