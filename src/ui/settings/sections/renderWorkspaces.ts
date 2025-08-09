/**
 * @file renderWorkspaces.ts
 * @brief Renders the workspace management section of the plugin settings tab.
 * @license See LICENSE.md
 */

import { Setting, ButtonComponent } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { WorkspaceSettings, createDefaultWorkspace } from '../../../types/settings';
import { WorkspaceModal } from '../components/WorkspaceModal';

export function renderWorkspaceSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  // Header section
  const workspaceSection = containerEl.createEl('div');

  new Setting(workspaceSection)
    .setName('Workspaces')
    .setDesc(
      'Create and manage calendar workspaces. Each workspace can have its own view settings, visible calendars, and filters.'
    )
    .setHeading();

  // Add workspace button
  new Setting(workspaceSection)
    .setName('Add new workspace')
    .setDesc('Create a new calendar workspace')
    .addButton(button => {
      button
        .setButtonText('New Workspace')
        .setIcon('plus')
        .onClick(() => {
          const newWorkspace = createDefaultWorkspace('New Workspace');
          new WorkspaceModal(plugin, newWorkspace, true, workspace => {
            plugin.settings.workspaces.push(workspace);
            plugin.saveSettings();
            rerender();
          }).open();
        });
    });

  // Workspace list
  if (plugin.settings.workspaces.length > 0) {
    const workspaceList = workspaceSection.createEl('div', { cls: 'workspace-list' });

    plugin.settings.workspaces.forEach((workspace, index) => {
      const workspaceItem = workspaceList.createEl('div', { cls: 'workspace-item' });

      new Setting(workspaceItem)
        .setName(workspace.name)
        .setDesc(getWorkspaceDescription(workspace))
        .addButton(button => {
          button
            .setButtonText('Edit')
            .setIcon('pencil')
            .onClick(() => {
              new WorkspaceModal(plugin, workspace, false, updatedWorkspace => {
                plugin.settings.workspaces[index] = updatedWorkspace;
                plugin.saveSettings();
                rerender();
              }).open();
            });
        })
        .addButton(button => {
          button
            .setButtonText('Duplicate')
            .setIcon('copy')
            .onClick(() => {
              const duplicatedWorkspace = createDefaultWorkspace(workspace.name + ' Copy');
              // Copy all settings from original workspace
              Object.assign(duplicatedWorkspace, {
                ...workspace,
                id: duplicatedWorkspace.id,
                name: duplicatedWorkspace.name
              });

              new WorkspaceModal(plugin, duplicatedWorkspace, true, newWorkspace => {
                plugin.settings.workspaces.push(newWorkspace);
                plugin.saveSettings();
                rerender();
              }).open();
            });
        })
        .addButton(button => {
          const isActive = plugin.settings.activeWorkspace === workspace.id;
          button
            .setButtonText(isActive ? 'Active' : 'Activate')
            .setIcon(isActive ? 'check' : 'play')
            .setDisabled(isActive)
            .onClick(async () => {
              plugin.settings.activeWorkspace = workspace.id;
              await plugin.saveSettings();
              rerender();
            });
        })
        .addButton(button => {
          button
            .setButtonText('Delete')
            .setIcon('trash-2')
            .setWarning()
            .onClick(async () => {
              // If this workspace is currently active, clear the active workspace
              if (plugin.settings.activeWorkspace === workspace.id) {
                plugin.settings.activeWorkspace = null;
              }

              plugin.settings.workspaces.splice(index, 1);
              await plugin.saveSettings();
              rerender();
            });
        });
    });
  }
  // Note: Empty state removed as requested - only show workspace list if there are workspaces
}

function getWorkspaceDescription(workspace: WorkspaceSettings): string {
  const parts: string[] = [];

  if (workspace.defaultView?.desktop || workspace.defaultView?.mobile) {
    const views = [];
    if (workspace.defaultView.desktop) views.push(`Desktop: ${workspace.defaultView.desktop}`);
    if (workspace.defaultView.mobile) views.push(`Mobile: ${workspace.defaultView.mobile}`);
    parts.push(views.join(', '));
  }

  if (workspace.visibleCalendars?.length) {
    parts.push(`Shows ${workspace.visibleCalendars.length} calendar(s)`);
  }

  if (workspace.categoryFilter?.categories.length) {
    const mode = workspace.categoryFilter.mode === 'show-only' ? 'Shows' : 'Hides';
    parts.push(
      `${mode} ${workspace.categoryFilter.categories.length} categor${workspace.categoryFilter.categories.length === 1 ? 'y' : 'ies'}`
    );
  }

  return parts.length > 0 ? parts.join(' • ') : 'Default settings';
}
