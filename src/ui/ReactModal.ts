import * as React from "react";
import ReactDOM from "react-dom/client";
import { App, Modal } from "obsidian";

type RenderCallback = (
    close: () => void,
) => Promise<ReturnType<typeof React.createElement>>;
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
