// src/ui/modals/DeleteRecurringModal.ts

import { App, ButtonComponent, Modal, Setting } from 'obsidian';

export class DeleteRecurringModal extends Modal {
  constructor(
    app: App,
    private onPromote: () => void,
    private onDeleteAll: () => void
  ) {
    super(app);
  }

  onOpen() {
    this.modalEl.addClass('full-calendar-confirm-modal');
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Delete Recurring Event' });
    contentEl.createEl('p', {
      text: 'This is a recurring event. What would you like to do with all of its future "override" instances (i.e., events that you have dragged or modified)?'
    });

    new Setting(contentEl)
      .setName('Promote child events')
      .setDesc(
        'Turn all future override events into standalone, single events. They will no longer be linked to this recurring series.'
      )
      .addButton((btn: ButtonComponent) =>
        btn
          .setButtonText('Promote Children')
          .setCta()
          .onClick(() => {
            this.close();
            this.onPromote();
          })
      );

    new Setting(contentEl)
      .setName('Delete child events')
      .setDesc(
        'Delete all future override events associated with this recurring series. This cannot be undone.'
      )
      .addButton((btn: ButtonComponent) =>
        btn
          .setButtonText('Delete Everything')
          .setWarning()
          .onClick(() => {
            this.close();
            this.onDeleteAll();
          })
      );

    new Setting(contentEl).addButton((btn: ButtonComponent) =>
      btn.setButtonText('Cancel').onClick(() => this.close())
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
