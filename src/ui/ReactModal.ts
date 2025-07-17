import * as React from "react";
import * as ReactDOM from "react-dom";
import { App, Modal } from "obsidian";

type RenderCallback = (close: () => void) => Promise<ReturnType<typeof React.createElement>>;
export default class ReactModal<_, __> extends Modal {
  onOpenCallback: RenderCallback;

  constructor(app: App, onOpenCallback: RenderCallback) {
    super(app);
    this.onOpenCallback = onOpenCallback;
  }

  async onOpen() {
    const { contentEl } = this;
    ReactDOM.render(await this.onOpenCallback(() => this.close()), contentEl);
  }

  onClose() {
    const { contentEl } = this;
    ReactDOM.unmountComponentAtNode(contentEl);
  }
}
