/**
 * @file Provides reusable UI components and logic for the Chrono Analyser.
 * This includes custom modals, autocomplete functionality, and other DOM-interactive elements.
 */

import { App, TFolder, SuggestModal } from 'obsidian';

/**
 * A specialized SuggestModal for selecting a folder from the vault.
 */
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

function updateActiveSuggestion(suggestions: HTMLElement[], index: number) {
  suggestions.forEach((suggestion, idx) => suggestion.classList.toggle('active', idx === index));
}

/**
 * Sets up an autocomplete suggestion box for a text input field.
 * It handles focus, input, and keyboard navigation for the suggestions.
 *
 * @param rootEl - The root HTML element containing the input and suggestion container.
 * @param inputId - The ID of the input element.
 * @param suggestionsId - The ID of the container element for suggestions.
 * @param getDataFunc - A function that returns an array of strings to be used as suggestions.
 * @param onSelectCallback - A callback function to execute when a suggestion is selected or the input is finalized.
 */
export function setupAutocomplete(
  rootEl: HTMLElement,
  inputId: string,
  suggestionsId: string,
  getDataFunc: () => string[],
  onSelectCallback: () => void
) {
  const input = rootEl.querySelector<HTMLInputElement>(`#${inputId}`);
  const suggestionsContainer = rootEl.querySelector<HTMLElement>(`#${suggestionsId}`);
  if (!input || !suggestionsContainer) return;

  let activeSuggestionIndex = -1;

  const populateSuggestions = (items: string[]) => {
    suggestionsContainer.innerHTML = '';
    activeSuggestionIndex = -1;
    if (items.length > 0) {
      items.forEach(item => {
        const div = document.createElement('div');
        div.textContent = item;
        div.addEventListener('click', () => {
          input.value = item;
          suggestionsContainer.innerHTML = '';
          suggestionsContainer.style.display = 'none';
          if (onSelectCallback) onSelectCallback();
        });
        suggestionsContainer.appendChild(div);
      });
      suggestionsContainer.style.display = 'block';
    } else {
      suggestionsContainer.style.display = 'none';
    }
  };

  input.addEventListener('focus', () => {
    const value = input.value.toLowerCase().trim();
    const data = getDataFunc();
    populateSuggestions(
      value === '' ? data : data.filter(item => item.toLowerCase().includes(value))
    );
  });
  input.addEventListener('input', () => {
    const value = input.value.toLowerCase().trim();
    const data = getDataFunc();
    populateSuggestions(
      value === ''
        ? (onSelectCallback(), data)
        : data.filter(item => item.toLowerCase().includes(value))
    );
  });
  input.addEventListener('blur', () =>
    setTimeout(() => (suggestionsContainer.style.display = 'none'), 150)
  );
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    let currentSuggestions = Array.from(suggestionsContainer.children) as HTMLElement[];
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestionIndex > -1 && currentSuggestions[activeSuggestionIndex]) {
        currentSuggestions[activeSuggestionIndex].click();
      } else {
        suggestionsContainer.innerHTML = '';
        suggestionsContainer.style.display = 'none';
        if (onSelectCallback) onSelectCallback();
      }
    } else if (e.key === 'Escape') {
      suggestionsContainer.innerHTML = '';
      suggestionsContainer.style.display = 'none';
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (suggestionsContainer.style.display === 'none' || currentSuggestions.length === 0) return;
      e.preventDefault();
      activeSuggestionIndex =
        e.key === 'ArrowDown'
          ? (activeSuggestionIndex + 1) % currentSuggestions.length
          : (activeSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
      updateActiveSuggestion(currentSuggestions, activeSuggestionIndex);
    }
  });
}
