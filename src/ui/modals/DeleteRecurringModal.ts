// src/ui/modals/DeleteRecurringModal.ts

import { App, ButtonComponent, Modal, Setting } from 'obsidian';
import { t } from '../../features/i18n/i18n';

export class DeleteRecurringModal extends Modal {
  constructor(
    app: App,
    private onPromote: () => void,
    private onDeleteAll: () => void,
    private onDeleteInstance?: () => void,
    private instanceDate?: string,
    private isGoogle: boolean = false
  ) {
    super(app);
  }

  onOpen() {
    this.modalEl.addClass('full-calendar-confirm-modal');
    const { contentEl } = this;
    contentEl.createEl('h2', { text: t('modals.deleteRecurring.title') });
    contentEl.createEl('p', {
      text: t('modals.deleteRecurring.description')
    });

    if (this.onDeleteInstance && this.instanceDate) {
      new Setting(contentEl)
        .setName(t('modals.deleteRecurring.deleteInstance.name'))
        .setDesc(
          t('modals.deleteRecurring.deleteInstance.description', { date: this.instanceDate })
        )
        .addButton((btn: ButtonComponent) =>
          btn
            .setButtonText(t('modals.deleteRecurring.deleteInstance.button'))
            .setCta()
            .onClick(() => {
              this.close();
              if (this.onDeleteInstance) {
                this.onDeleteInstance();
              }
            })
        );
    }

    // Wrap the "Promote" setting in a condition
    if (!this.isGoogle) {
      new Setting(contentEl)
        .setName(t('modals.deleteRecurring.promoteChildren.name'))
        .setDesc(t('modals.deleteRecurring.promoteChildren.description'))
        .addButton((btn: ButtonComponent) =>
          btn
            .setButtonText(t('modals.deleteRecurring.promoteChildren.button'))
            .setCta()
            .onClick(() => {
              this.close();
              this.onPromote();
            })
        );
    }

    new Setting(contentEl)
      .setName(t('modals.deleteRecurring.deleteAll.name'))
      .setDesc(t('modals.deleteRecurring.deleteAll.description'))
      .addButton((btn: ButtonComponent) =>
        btn
          .setButtonText(t('modals.deleteRecurring.deleteAll.button'))
          .setCta()
          .onClick(() => {
            this.close();
            this.onDeleteAll();
          })
      );

    new Setting(contentEl).addButton((btn: ButtonComponent) =>
      btn.setButtonText(t('modals.deleteRecurring.cancel')).onClick(() => this.close())
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
