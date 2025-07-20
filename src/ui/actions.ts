/**
 * @file actions.ts
 * @brief Contains standalone functions for user-initiated actions.
 *
 * @description
 * This file defines high-level user actions that can be triggered from various
 * parts of the UI, such as opening the note associated with an event.
 * These functions encapsulate the logic of interacting with both the
 * `EventCache` and the Obsidian workspace.
 *
 * @license See LICENSE.md
 */

import { MarkdownView, TFile, Vault, Workspace } from 'obsidian';
import EventCache from 'src/core/EventCache';

/**
 * Open a file in the editor to a given event.
 * @param cache
 * @param param1 App
 * @param id event ID
 * @returns
 */
export async function openFileForEvent(
  cache: EventCache,
  { workspace, vault }: { workspace: Workspace; vault: Vault },
  id: string
) {
  const details = cache.getInfoForEditableEvent(id);
  if (!details) {
    throw new Error('Event does not have local representation.');
  }
  const {
    location: { path, lineNumber }
  } = details;
  let leaf = workspace.getMostRecentLeaf();
  const file = vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    return;
  }
  if (!leaf) {
    return;
  }
  if (leaf.getViewState().pinned) {
    leaf = workspace.getLeaf('tab');
  }
  await leaf.openFile(file);
  if (lineNumber && leaf.view instanceof MarkdownView) {
    leaf.view.editor.setCursor({ line: lineNumber, ch: 0 });
  }
}
