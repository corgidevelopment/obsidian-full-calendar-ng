// src/chrono_analyser/modules/ui.ts

import { App, Modal, Setting, TFolder, SuggestModal } from 'obsidian';

// DATA STRUCTURES
interface InsightRule {
  hierarchies: string[];
  projects: string[];
  subprojectKeywords: string[];
}
interface InsightGroups {
  [groupName: string]: { rules: InsightRule };
}
export interface InsightsConfig {
  version: number;
  lastUpdated: string;
  insightGroups: InsightGroups;
}

// --- Autocomplete Component Class ---
class AutocompleteComponent {
  private inputEl: HTMLInputElement;
  private wrapperEl: HTMLElement;
  private suggestionsEl: HTMLElement;
  private onSelectCallback: (value: string) => void;
  private getDataFunc: () => string[];
  private activeSuggestionIndex = -1;

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
        this.onSelectCallback(valueToSubmit);
        this.suggestionsEl.style.display = 'none';
        this.inputEl.blur();
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

  private populateSuggestions = (items: string[]) => {
    this.suggestionsEl.empty();
    this.activeSuggestionIndex = -1;

    if (items.length > 0) {
      items.forEach(item => {
        const div = this.suggestionsEl.createDiv({ cls: 'autocomplete-suggestion-item' });
        div.textContent = item;
        div.addEventListener('mousedown', e => {
          e.preventDefault(); // Prevent blur event from firing first
          this.onSelectCallback(item);
          this.suggestionsEl.style.display = 'none';
        });
      });
      this.suggestionsEl.style.display = 'block';
    } else {
      this.suggestionsEl.style.display = 'none';
    }
  };

  private updateFilteredSuggestions = () => {
    const value = this.inputEl.value.toLowerCase().trim();
    const allData = this.getDataFunc();
    const filteredData =
      value === '' ? allData : allData.filter(item => item.toLowerCase().includes(value));
    this.populateSuggestions(filteredData);
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

    this.config = existingConfig || {
      version: 1,
      lastUpdated: new Date().toISOString(),
      insightGroups: {
        Work: { rules: { hierarchies: ['Work'], projects: [], subprojectKeywords: [] } },
        Personal: { rules: { hierarchies: ['Personal'], projects: [], subprojectKeywords: [] } }
      }
    };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('chrono-analyser-modal');
    contentEl.createEl('h2', { text: 'Configure Insight Groups' });
    contentEl.createEl('p', {
      text: 'Create groups to categorize your activities. The engine will use these rules to generate personalized insights.'
    });

    const groupsContainer = contentEl.createDiv();
    this.renderGroups(groupsContainer);

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
            this.close();
          })
      )
      .addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));
  }

  private renderGroups(container: HTMLElement) {
    container.empty();
    const groupsEl = container.createDiv('insight-groups-container');
    for (const groupName in this.config.insightGroups) {
      this.renderGroupSetting(groupsEl, groupName, this.config.insightGroups[groupName].rules);
    }
    new Setting(container).addButton(btn =>
      btn.setButtonText('Add New Insight Group').onClick(() => {
        const newGroupName = `New Group ${Object.keys(this.config.insightGroups).length + 1}`;
        this.config.insightGroups[newGroupName] = {
          rules: { hierarchies: [], projects: [], subprojectKeywords: [] }
        };
        this.renderGroupSetting(
          groupsEl,
          newGroupName,
          this.config.insightGroups[newGroupName].rules
        );
      })
    );
  }

  private renderGroupSetting(container: HTMLElement, groupName: string, rules: InsightRule) {
    const groupContainer = container.createDiv({ cls: 'insight-group-setting' });
    const nameSetting = new Setting(groupContainer)
      .setName('Group Name')
      .addText(text =>
        text.setValue(groupName).onChange(newName => {
          if (newName && newName !== groupName && !this.config.insightGroups[newName]) {
            const oldGroup = this.config.insightGroups[groupName];
            delete this.config.insightGroups[groupName];
            this.config.insightGroups[newName] = oldGroup;
          }
        })
      )
      .addExtraButton(btn =>
        btn
          .setIcon('trash')
          .setTooltip('Delete this group')
          .onClick(() => {
            const currentName =
              nameSetting.nameEl.nextElementSibling?.querySelector('input')?.value || groupName;
            delete this.config.insightGroups[currentName];
            groupContainer.remove();
          })
      );

    this.createTagInput(
      groupContainer,
      'Matching Hierarchies',
      'Press Enter or select a suggestion.',
      rules.hierarchies,
      this.knownHierarchies
    );
    this.createTagInput(
      groupContainer,
      'Matching Projects',
      'Press Enter or select a suggestion.',
      rules.projects,
      this.knownProjects
    );

    new Setting(groupContainer)
      .setName('Matching Sub-project Keywords')
      .setDesc('Add keywords that will match if found anywhere in a sub-project.')
      .addTextArea(text => {
        text.setValue(rules.subprojectKeywords.join('\n')).onChange(value => {
          rules.subprojectKeywords = value
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);
        });
      });
  }

  private createTagInput(
    container: HTMLElement,
    name: string,
    desc: string,
    values: string[],
    suggestions: string[]
  ) {
    const setting = new Setting(container).setName(name).setDesc(desc);
    // The wrapper now only needs this one class. The component does the rest.
    const wrapper = setting.controlEl.createDiv({ cls: 'autocomplete-wrapper' });
    const tagInputContainer = wrapper.createDiv({ cls: 'tag-input-container' });
    const tagsEl = tagInputContainer.createDiv({ cls: 'tags' });
    const inputEl = tagInputContainer.createEl('input', { type: 'text', cls: 'tag-input' });

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
        }
        inputEl.value = '';
      }
    });

    // Use the new, clean setup function.
    setupAutocomplete(
      wrapper,
      value => {
        const newTag = value.trim();
        if (newTag && !values.includes(newTag)) {
          values.push(newTag);
          renderTags();
        }
        inputEl.value = '';
        inputEl.focus();
      },
      () => suggestions
    );

    renderTags();
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
