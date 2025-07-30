// src/chrono_analyser/modules/DetailPopup.ts

import { App } from 'obsidian';
import { TimeRecord } from '../../data/types';
import * as Utils from '../../data/utils';

/**
 * Manages the detail popup modal, including its visibility and content.
 */
export class DetailPopup {
  private popupEl: HTMLElement;
  private overlayEl: HTMLElement;
  private titleEl: HTMLElement;
  private statsEl: HTMLElement;
  private tableBodyEl: HTMLTableSectionElement;
  private closeBtn: HTMLElement;
  private popupBodyEl: HTMLElement;

  constructor(
    private app: App,
    private rootEl: HTMLElement
  ) {
    this.popupEl = this.rootEl.querySelector<HTMLElement>('#detailPopup')!;
    this.overlayEl = this.rootEl.querySelector<HTMLElement>('#detailOverlay')!;
    this.titleEl = this.rootEl.querySelector<HTMLElement>('#popupTitle')!;
    this.statsEl = this.rootEl.querySelector<HTMLElement>('#popupSummaryStats')!;
    this.tableBodyEl = this.rootEl.querySelector<HTMLTableSectionElement>('#popupTableBody')!;
    this.closeBtn = this.rootEl.querySelector<HTMLElement>('#popupCloseBtn')!;
    this.popupBodyEl = this.rootEl.querySelector<HTMLElement>('.popup-body')!;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.closeBtn.addEventListener('click', this.hide);
    this.overlayEl.addEventListener('click', this.hide);
  }

  public show = (categoryName: string, recordsList: TimeRecord[], context: any = {}) => {
    if (!this.popupEl || !this.overlayEl || !this.tableBodyEl) return;

    this.popupBodyEl.scrollTop = 0;
    this.titleEl.textContent = `Details for: ${categoryName}`;

    const numSourceFiles = new Set(recordsList.map(r => r.path)).size;
    const displayTotalHours =
      context.value ??
      recordsList.reduce(
        (sum: number, r: TimeRecord) => sum + (r._effectiveDurationInPeriod || 0),
        0
      );

    // --- MODIFIED: Safe, programmatic creation of the stats section ---
    // Use .empty() for safe clearing, casting to `any` to satisfy TypeScript
    (this.statsEl as any).empty();

    const createStatCard = (value: string, label: string) => {
      const card = this.statsEl.createDiv({ cls: 'summary-stat' });
      card.createDiv({ cls: 'summary-stat-value', text: value });
      card.createDiv({ cls: 'summary-stat-label', text: label });
    };

    createStatCard(String(numSourceFiles), 'Unique Files');
    createStatCard(displayTotalHours.toFixed(2), 'Total Hours');
    // --- END MODIFICATION ---

    // Use .empty() for safe clearing, casting to `any` to satisfy TypeScript
    (this.tableBodyEl as any).empty();

    recordsList.forEach(record => {
      const row = this.tableBodyEl.insertRow();
      row.insertCell().textContent = record.project;
      row.insertCell().textContent = record.subprojectFull;
      row.insertCell().textContent = (record._effectiveDurationInPeriod || record.duration).toFixed(
        2
      );
      const dateCell = row.insertCell();
      dateCell.textContent = record.date ? Utils.getISODate(record.date) : 'Recurring';

      // --- MODIFIED: Safe, programmatic creation of the file path cell ---
      const pathCell = row.insertCell();
      // HACK: Cast to `any` to access Obsidian's augmented .createSpan() method
      (pathCell as any).createSpan({
        cls: 'file-path-cell',
        text: record.path,
        attr: { title: record.path }
      });
      // --- END MODIFICATION ---
    });

    this.overlayEl.classList.add('visible');
    this.popupEl.classList.add('visible');
    // Use the App instance to find the correct body element for overflow prevention
    this.app.workspace.containerEl.ownerDocument.body.style.overflow = 'hidden';
  };

  public hide = () => {
    this.overlayEl.classList.remove('visible');
    this.popupEl.classList.remove('visible');
    this.app.workspace.containerEl.ownerDocument.body.style.overflow = '';
  };
}
