// src/chrono_analyser/modules/ui.ts

import { App, Modal, Setting, TFolder, SuggestModal, Notice } from 'obsidian';

// DATA STRUCTURES
interface InsightRule {
  hierarchies: string[];
  projects: string[];
  subprojectKeywords: string[];
  mutedSubprojectKeywords: string[];
  mutedProjects: string[];
  // Legacy field for migration
  subprojectKeywords_exclude?: string[];
}

interface InsightGroup {
  rules: InsightRule;
  persona: 'productivity' | 'wellness' | 'none';
}

// Legacy interface for migration - allows partial persona
interface LegacyInsightGroup {
  rules: InsightRule;
  persona?: 'productivity' | 'wellness' | 'none';
}

interface InsightGroups {
  [groupName: string]: InsightGroup;
}

interface LegacyInsightGroups {
  [groupName: string]: LegacyInsightGroup;
}

export interface InsightsConfig {
  version: number;
  lastUpdated: string;
  insightGroups: InsightGroups;
}

// Legacy config interface for migration
interface LegacyInsightsConfig {
  version: number;
  lastUpdated: string;
  insightGroups: LegacyInsightGroups;
}

// --- Autocomplete Component Class ---
class AutocompleteComponent {
  private inputEl: HTMLInputElement;
  private wrapperEl: HTMLElement;
  private suggestionsEl: HTMLElement;
  private onSelectCallback: (value: string) => void;
  private getDataFunc: () => string[];
  private activeSuggestionIndex = -1;
  private isSelectionInProgress = false;

  constructor(
    wrapperEl: HTMLElement,
    onSelectCallback: (value: string) => void,
    getDataFunc: () => string[]
  ) {
    this.wrapperEl = wrapperEl;
    this.inputEl = wrapperEl.querySelector('input')!;
    this.onSelectCallback = onSelectCallback;
    this.getDataFunc = getDataFunc;

    this.suggestionsEl = this.wrapperEl.createDiv({ cls: 'autocomplete-suggestions' });

    this.bindEvents();
  }

  private bindEvents() {
    this.inputEl.addEventListener('focus', this.updateFilteredSuggestions);
    this.inputEl.addEventListener('input', this.updateFilteredSuggestions);
    this.inputEl.addEventListener('blur', this.onBlur);
    this.inputEl.addEventListener('keydown', this.onKeyDown);
  }

  private onBlur = () => {
    // Delay hiding to allow click events on suggestions to fire
    setTimeout(() => {
      this.suggestionsEl.style.display = 'none';
    }, 200);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const suggestions = Array.from(this.suggestionsEl.children) as HTMLElement[];
    if (suggestions.length === 0 && e.key !== 'Enter' && e.key !== 'Escape') return;

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        const valueToSubmit =
          this.activeSuggestionIndex > -1 && suggestions[this.activeSuggestionIndex]
            ? suggestions[this.activeSuggestionIndex].textContent!
            : this.inputEl.value;

        this.isSelectionInProgress = true;
        this.onSelectCallback(valueToSubmit);
        this.suggestionsEl.style.display = 'none';
        this.inputEl.blur();
        this.isSelectionInProgress = false;
        break;
      case 'Escape':
        this.suggestionsEl.style.display = 'none';
        break;
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        this.activeSuggestionIndex =
          e.key === 'ArrowDown'
            ? (this.activeSuggestionIndex + 1) % suggestions.length
            : (this.activeSuggestionIndex - 1 + suggestions.length) % suggestions.length;
        this.updateActiveSuggestion(suggestions, this.activeSuggestionIndex);
        break;
    }
  };

  private updateFilteredSuggestions = () => {
    if (this.isSelectionInProgress) return;
    const value = this.inputEl.value.toLowerCase().trim();
    const allData = this.getDataFunc();
    const filteredData =
      value === '' ? allData : allData.filter(item => item.toLowerCase().includes(value));
    this.populateSuggestions(filteredData);
  };

  private populateSuggestions = (suggestions: string[]) => {
    this.suggestionsEl.empty();
    this.activeSuggestionIndex = -1;

    if (suggestions.length > 0) {
      suggestions.forEach((item, idx) => {
        const div = document.createElement('div');
        div.textContent = item;
        div.classList.add('autocomplete-suggestion-item');

        div.addEventListener('mousedown', e => {
          e.preventDefault(); // Prevent blur event from firing first
          this.isSelectionInProgress = true;
          this.onSelectCallback(item);
          this.suggestionsEl.style.display = 'none';
          this.isSelectionInProgress = false;
        });

        this.suggestionsEl.appendChild(div);
      });
      this.suggestionsEl.style.display = 'block';
    } else {
      this.suggestionsEl.style.display = 'none';
    }
  };

  private updateActiveSuggestion(suggestions: HTMLElement[], index: number) {
    suggestions.forEach((suggestion, idx) => {
      suggestion.classList.toggle('is-active', idx === index);
    });
  }
}

// --- NEW simplified setup function ---
export function setupAutocomplete(
  wrapperEl: HTMLElement,
  onSelectCallback: (value: string) => void,
  getDataFunc: () => string[]
) {
  if (wrapperEl.querySelector('input')) {
    new AutocompleteComponent(wrapperEl, onSelectCallback, getDataFunc);
  }
}

// INSIGHTS CONFIG MODAL - NOW WITH WORKING AUTOCOMPLETE
export class InsightConfigModal extends Modal {
  private config: InsightsConfig;
  private onSave: (newConfig: InsightsConfig) => void;
  private knownHierarchies: string[];
  private knownProjects: string[];
  private expandedGroupName: string | null = null; // Collapsible state

  private groupsContainerEl!: HTMLElement; // Our stable container
  private originalConfigString: string = '';
  private hasUnsavedChanges: boolean = false;
  private isSaving: boolean = false;

  constructor(
    app: App,
    existingConfig: InsightsConfig | null,
    knownHierarchies: string[],
    knownProjects: string[],
    onSaveCallback: (newConfig: InsightsConfig) => void
  ) {
    super(app);
    this.onSave = onSaveCallback;
    this.knownHierarchies = knownHierarchies;
    this.knownProjects = knownProjects;

    const defaultConfig: InsightsConfig = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      insightGroups: {
        Work: {
          persona: 'productivity',
          rules: {
            hierarchies: ['Work'],
            projects: [],
            subprojectKeywords: [],
            mutedSubprojectKeywords: [],
            mutedProjects: []
          }
        },
        Personal: {
          persona: 'wellness',
          rules: {
            hierarchies: ['Personal'],
            projects: [],
            subprojectKeywords: [],
            mutedSubprojectKeywords: [],
            mutedProjects: []
          }
        }
      }
    };

    // --- MIGRATION LOGIC: safely migrate legacy config ---
    let migratedConfig = existingConfig || defaultConfig;
    if (migratedConfig && migratedConfig.insightGroups) {
      // Cast to legacy config for safe migration
      const legacyConfig = migratedConfig as unknown as LegacyInsightsConfig;

      Object.entries(legacyConfig.insightGroups).forEach(([groupName, group]) => {
        if (group) {
          // Safely add persona if missing
          if (group.persona === undefined) {
            group.persona = 'productivity';
          }

          // Existing migration for muted fields
          if (group.rules.mutedProjects === undefined) {
            group.rules.mutedProjects = [];
          }

          if (group.rules.mutedSubprojectKeywords === undefined) {
            if (group.rules.subprojectKeywords_exclude) {
              group.rules.mutedSubprojectKeywords = group.rules.subprojectKeywords_exclude;
            } else {
              group.rules.mutedSubprojectKeywords = [];
            }
          }

          // Clean up legacy field
          if (group.rules.subprojectKeywords_exclude !== undefined) {
            delete group.rules.subprojectKeywords_exclude;
          }
        }
      });
    }

    // Now we can safely assign the migrated config
    this.config = migratedConfig as InsightsConfig;
    // --- END MIGRATION LOGIC ---
  }

  private rerender() {
    this.renderGroups(this.groupsContainerEl);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('chrono-analyser-modal');
    contentEl.createEl('h2', { text: 'Configure Insight Groups' });
    contentEl.createEl('p', {
      text: 'Create groups to categorize your activities. The engine will use these rules to generate personalized insights.'
    });

    // --- INITIALIZE THE STABLE CONTAINER ---
    this.groupsContainerEl = contentEl.createDiv();
    this.rerender(); // Initial render

    new Setting(contentEl)
      .addButton(btn =>
        btn
          .setButtonText('Save Configuration')
          .setCta()
          .onClick(() => {
            // Prune any empty or invalid group names before saving
            Object.keys(this.config.insightGroups).forEach(name => {
              if (!name) delete this.config.insightGroups[name];
            });

            this.config.lastUpdated = new Date().toISOString();
            this.onSave(this.config);

            this.isSaving = true;
            this.close();
          })
      )
      .addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));

    // Track original config for unsaved changes
    this.originalConfigString = JSON.stringify(this.config);
    this.hasUnsavedChanges = false;
    this.isSaving = false;
  }

  private renderGroups(container: HTMLElement) {
    container.empty();
    const groupsEl = container.createDiv('insight-groups-container');
    for (const groupName in this.config.insightGroups) {
      const groupData = this.config.insightGroups[groupName];
      if (groupData && groupData.rules) {
        this.renderGroupSetting(groupsEl, groupName, groupData); // Pass groupData (with persona)
      } else {
        // Clean up corrupt group
        console.warn(`[Chrono Analyser] Found and removed corrupt insight group: "${groupName}"`);
        delete this.config.insightGroups[groupName];
      }
    }
    new Setting(container).addButton(btn =>
      btn.setButtonText('Add New Insight Group').onClick(() => {
        const newGroupName = `New Group ${Object.keys(this.config.insightGroups).length + 1}`;
        this.config.insightGroups[newGroupName] = {
          persona: 'productivity', // <-- ADD persona to new groups
          rules: {
            hierarchies: [],
            projects: [],
            subprojectKeywords: [],
            mutedSubprojectKeywords: [],
            mutedProjects: []
          }
        };
        this.checkForUnsavedChanges();
        this.expandedGroupName = newGroupName; // Expand the new group by default
        this.rerender();
      })
    );
  }

  // --- REPLACE THE ENTIRE renderGroupSetting METHOD ---
  private renderGroupSetting(container: HTMLElement, groupName: string, groupData: InsightGroup) {
    let currentGroupName = groupName;
    const { rules, persona } = groupData;
    const isExpanded = this.expandedGroupName === currentGroupName;

    const groupContainer = container.createDiv({ cls: 'insight-group-setting' });
    groupContainer.toggleClass('is-expanded', isExpanded);

    groupContainer.addEventListener('click', evt => {
      // Only expand if collapsed. Collapsing is handled by the header's click listener.
      if (!isExpanded) {
        this.expandedGroupName = currentGroupName;
        this.rerender();
      }
    });

    const nameSetting = new Setting(groupContainer)
      .setName('Group Name')
      .addText(text => {
        text
          .setValue(currentGroupName)
          .setPlaceholder('e.g., Work')
          .setDisabled(!isExpanded)
          .onChange(() => {
            this.checkForUnsavedChanges();
          });

        // Use 'blur' to finalize the rename
        text.inputEl.addEventListener('blur', () => {
          // If the group was deleted while this input had focus, do nothing.
          if (!this.config.insightGroups[currentGroupName]) {
            return;
          }

          const newNameTrimmed = text.inputEl.value.trim();
          if (!newNameTrimmed || newNameTrimmed === currentGroupName) {
            text.inputEl.value = currentGroupName;
            return;
          }
          if (this.config.insightGroups[newNameTrimmed]) {
            new Notice(`Group name "${newNameTrimmed}" already exists.`);
            text.inputEl.value = currentGroupName;
            return;
          }
          const groupData = this.config.insightGroups[currentGroupName];
          if (groupData) {
            delete this.config.insightGroups[currentGroupName];
            this.config.insightGroups[newNameTrimmed] = groupData;
            this.expandedGroupName = newNameTrimmed;
            this.rerender();
          }
        });
      })
      .addExtraButton(btn => {
        btn
          .setIcon('trash')
          .setTooltip('Delete this group')
          .setDisabled(!isExpanded)
          // REMOVE 'evt' and 'stopPropagation'
          .onClick(() => {
            delete this.config.insightGroups[currentGroupName];
            this.checkForUnsavedChanges();

            // If we deleted the currently expanded group, no group should be expanded.
            if (this.expandedGroupName === currentGroupName) {
              this.expandedGroupName = null;
            }

            this.rerender();
          });
      });

    // Make the header clickable to collapse the group
    nameSetting.settingEl.addEventListener('click', evt => {
      const target = evt.target as HTMLElement;
      if (target.closest('input, button, .tag-remove')) return;

      if (isExpanded) {
        this.expandedGroupName = null;
        this.rerender();
      }
    });

    // Foldable content container
    const foldableContent = groupContainer.createDiv('foldable-content');

    // --- ADD Persona Dropdown ---
    new Setting(foldableContent)
      .setName('Analyze as Persona')
      .setDesc('Choose the analytical model to apply to this group.')
      .setDisabled(!isExpanded)
      .addDropdown(dd => {
        dd.addOption('productivity', '🎯 Productivity')
          .addOption('wellness', '❤️ Wellness & Routine')
          .addOption('none', '⚪ (Ignore in Dashboard)')
          .setValue(persona || 'productivity')
          .onChange(value => {
            // Type-safe assignment using proper type guard
            if (value === 'productivity' || value === 'wellness' || value === 'none') {
              groupData.persona = value;
              this.checkForUnsavedChanges();
            }
          });
      });

    this.createTagInput(
      foldableContent,
      'Matching Hierarchies',
      'e.g., Work Calendar, Personal Calendar',
      'Add hierarchy...',
      rules.hierarchies || [],
      this.knownHierarchies,
      () => this.checkForUnsavedChanges()
    );
    this.createTagInput(
      foldableContent,
      'Matching Projects',
      'e.g., Project Phoenix, Q4 Report',
      'Add project...',
      rules.projects || [],
      this.knownProjects,
      () => this.checkForUnsavedChanges()
    );
    this.createTagInput(
      foldableContent,
      'Muted Projects',
      'Mute specific projects (case-sensitive, exact match) to exclude them from Habit Consistency checks.',
      'Add muted project...',
      rules.mutedProjects || [],
      this.knownProjects,
      () => this.checkForUnsavedChanges()
    );

    new Setting(foldableContent)
      .setName('Matching Sub-project Keywords')
      .setDesc('Add keywords that will match if found anywhere in a sub-project.')
      .addTextArea(text => {
        text
          .setValue((rules.subprojectKeywords || []).join('\n'))
          .setPlaceholder('eg., design\nresearch\nmeeting')
          .setDisabled(!isExpanded)
          .onChange(value => {
            rules.subprojectKeywords = value
              .split('\n')
              .map(s => s.trim())
              .filter(Boolean);
            this.checkForUnsavedChanges();
          });
      });

    new Setting(foldableContent)
      .setName('Muted Sub-project Keywords')
      .setDesc(
        'Mute activities by keyword. If a sub-project contains any of these (case-insensitive) keywords, it will be excluded from Habit Consistency checks.'
      )
      .addTextArea(text => {
        text
          .setValue((rules.mutedSubprojectKeywords || []).join('\n'))
          .setPlaceholder('e.g., completed\narchive\nold')
          .setDisabled(!isExpanded)
          .onChange(value => {
            rules.mutedSubprojectKeywords = value
              .split('\n')
              .map(s => s.trim())
              .filter(Boolean);
            this.checkForUnsavedChanges();
          });
      });
  }

  private createTagInput(
    container: HTMLElement,
    name: string,
    desc: string,
    placeholder: string,
    values: string[],
    suggestions: string[],
    onChange?: () => void
  ) {
    const setting = new Setting(container).setName(name).setDesc(desc);
    const wrapper = setting.controlEl.createDiv({ cls: 'autocomplete-wrapper' });
    const tagInputContainer = wrapper.createDiv({ cls: 'tag-input-container' });
    const tagsEl = tagInputContainer.createDiv({ cls: 'tags' });
    const inputEl = tagInputContainer.createEl('input', {
      type: 'text',
      cls: 'tag-input',
      placeholder
    });

    const renderTags = () => {
      tagsEl.empty();
      values.forEach((tag, index) => {
        const tagEl = tagsEl.createDiv({ cls: 'tag' });
        tagEl.setText(tag);
        const removeEl = tagEl.createSpan({ cls: 'tag-remove' });
        removeEl.setText('×');
        removeEl.onClickEvent(() => {
          values.splice(index, 1);
          renderTags();
          if (onChange) onChange();
        });
      });
    };

    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && inputEl.value) {
        e.preventDefault();
        const newTag = inputEl.value.trim();
        if (newTag && !values.includes(newTag)) {
          values.push(newTag);

          renderTags();
          if (onChange) onChange();
        }
        inputEl.value = '';
      }
    });

    setupAutocomplete(
      wrapper,
      value => {
        const newTag = value.trim();
        if (newTag && !values.includes(newTag)) {
          values.push(newTag);

          renderTags();
          if (onChange) onChange();
        }
        inputEl.value = '';
        inputEl.focus();
      },
      () => suggestions
    );

    renderTags();
  }

  private checkForUnsavedChanges() {
    const currentConfigString = JSON.stringify(this.config);
    this.hasUnsavedChanges = currentConfigString !== this.originalConfigString;
  }

  close() {
    this.checkForUnsavedChanges();
    if (this.hasUnsavedChanges && !this.isSaving) {
      this.showConfirmationModal();
    } else {
      super.close();
    }
  }

  private showConfirmationModal() {
    const confirmationModal = new Modal(this.app);
    confirmationModal.contentEl.addClass('chrono-analyser-modal');
    confirmationModal.contentEl.createEl('h2', { text: 'Unsaved Changes' });
    confirmationModal.contentEl.createEl('p', {
      text: 'You have unsaved changes. Would you like to save them before closing?'
    });

    new Setting(confirmationModal.contentEl)
      .addButton(btn =>
        btn
          .setButtonText('Save and Close')
          .setCta()
          .onClick(() => {
            this.isSaving = true;
            const saveButton = this.modalEl.querySelector('.mod-cta') as HTMLButtonElement;
            saveButton?.click();
            confirmationModal.close();
          })
      )
      .addButton(btn =>
        btn.setButtonText('Discard Changes').onClick(() => {
          this.isSaving = true;
          confirmationModal.close();
          this.close();
        })
      );

    confirmationModal.open();
  }

  onClose() {
    this.contentEl.empty();
  }
}

// FOLDER SUGGEST MODAL
export class FolderSuggestModal extends SuggestModal<TFolder> {
  constructor(
    app: App,
    private onChoose: (folder: TFolder) => void
  ) {
    super(app);
    this.setPlaceholder('Select a folder with your time tracking files...');
  }
  getSuggestions(query: string): TFolder[] {
    const queryLower = query.toLowerCase();
    return this.app.vault
      .getAllLoadedFiles()
      .filter(
        (file): file is TFolder =>
          file instanceof TFolder && file.path.toLowerCase().includes(queryLower)
      );
  }
  renderSuggestion(folder: TFolder, el: HTMLElement) {
    el.createEl('div', { text: folder.path });
  }
  onChooseSuggestion(folder: TFolder, evt: MouseEvent | KeyboardEvent) {
    this.onChoose(folder);
  }
}
