/**
 * @file BulkCategorizeModal.ts
 * @brief Modal dialog for bulk categorizing events in local calendars.
 *
 * @description
 * Presents the user with three options for updating event categories:
 * 1. Smart Folder Update: Uses the parent folder name as the category for uncategorized events.
 * 2. Forced Folder Update: Prepends the parent folder name to all event titles, regardless of existing categories.
 * 3. Forced Default Update: Prepends a user-provided category to all event titles, stacking with any existing categories.
 *
 * The modal collects user input and invokes the provided `onSubmit` callback with the selected method and, if applicable, the default category.
 *
 * @remarks
 * - This operation is intended as a one-time bulk update and will modify event notes to match the required formatting.
 * - The modal uses Obsidian's UI components for settings and notifications.
 *
 * @example
 * ```typescript
 * new BulkCategorizeModal(app, (choice, defaultCategory) => {
 *   // Handle the user's selection here
 * });
 * ```
 *
 * @public
 */

import { App, Modal, Notice, Setting, TextComponent } from 'obsidian';

// This modal presents the 3 bulk-update choices to the user.
export class BulkCategorizeModal extends Modal {
  onSubmit: (choice: 'smart' | 'force_folder' | 'force_default', defaultCategory?: string) => void;

  constructor(
    app: App,
    onSubmit: (choice: 'smart' | 'force_folder' | 'force_default', defaultCategory?: string) => void
  ) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Choose a Bulk-Update Method' });
    contentEl.createEl('p', {
      text: 'How would you like to automatically categorize existing events in your local calendars? Note that this is a one time operation that will modify your event notes to match the required formatting.'
    });

    // Option 1: Smart Folder Update
    new Setting(contentEl)
      .setName('Use Parent Folder (Smart)')
      .setDesc(
        "Use parent folder names as the category for UN-categorized events. Events that already look like 'Category - Title' will be skipped."
      )
      .addButton(button =>
        button
          .setButtonText('Run Smart Update')
          .setCta()
          .onClick(() => {
            this.onSubmit('smart');
            this.close();
          })
      );

    // Option 2: Forced Folder Update
    new Setting(contentEl)
      .setName('Use Parent Folder (Forced)')
      .setDesc(
        'PREPENDS the parent folder name to ALL event titles, even if they already have a category. Warning: This creates nested categories.'
      )
      .addButton(button =>
        button
          .setButtonText('Run Forced Update')
          .setWarning()
          .onClick(() => {
            this.onSubmit('force_folder');
            this.close();
          })
      );

    // Option 3: Forced Default Update
    let textInput: TextComponent;
    new Setting(contentEl)
      .setName('Forced Default Update')
      .setDesc(
        'Prepends a category you provide to ALL event titles. If a category already exists, the new one will be added in front (e.g., New - Old - Title).'
      )
      .addText(text => {
        textInput = text;
        text.setPlaceholder('Enter default category');
      })
      .addButton(button =>
        button
          .setButtonText('Set Default')
          .setWarning()
          .onClick(() => {
            const categoryValue = textInput.getValue().trim();
            if (categoryValue === '') {
              new Notice('Please enter a category name.');
              return;
            }
            this.onSubmit('force_default', categoryValue);
            this.close();
          })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}
