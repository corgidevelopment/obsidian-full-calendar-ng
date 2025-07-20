/**
 * @file ReactModal.ts
 * @brief A generic Obsidian Modal class for hosting React components.
 *
 * @description
 * This file defines a reusable `ReactModal` class that extends Obsidian's
 * built-in `Modal`. It handles the lifecycle of mounting and unmounting a
 * React component within the modal, providing a clean way to use React for
 * complex UI inside a standard Obsidian modal window.
 *
 * @license See LICENSE.md
 */

import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { App, Modal } from 'obsidian';

type RenderCallback = (close: () => void) => Promise<ReturnType<typeof React.createElement>>;
export default class ReactModal<Props, Component> extends Modal {
  onOpenCallback: RenderCallback;

  constructor(app: App, onOpenCallback: RenderCallback) {
    super(app);
    this.onOpenCallback = onOpenCallback;
  }
  // Somewhere in your class (to unmount later)
  private reactRoot: ReactDOM.Root | null = null;
  async onOpen() {
    const { contentEl } = this;

    // Create root and render component
    this.reactRoot = ReactDOM.createRoot(contentEl);

    const element = await this.onOpenCallback(() => this.close());
    this.reactRoot.render(element);
  }

  onClose() {
    if (this.reactRoot) {
      this.reactRoot.unmount();
      this.reactRoot = null;
    }

    this.contentEl.empty(); // still needed for modal cleanup
  }
}
