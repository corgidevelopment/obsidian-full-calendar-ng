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

  public show = (
    categoryName: string,
    recordsList: TimeRecord[],
    context: Record<string, unknown> & { value?: number | null } = {}
  ) => {
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
    if (typeof this.statsEl.empty === 'function') this.statsEl.empty();
    else this.statsEl.textContent = '';

    const createStatCard = (value: string, label: string) => {
      if (typeof this.statsEl.createDiv !== 'function') {
        const wrapper = document.createElement('div');
        wrapper.className = 'summary-stat';
        const valEl = document.createElement('div');
        valEl.className = 'summary-stat-value';
        valEl.textContent = value;
        const labelEl = document.createElement('div');
        labelEl.className = 'summary-stat-label';
        labelEl.textContent = label;
        wrapper.appendChild(valEl);
        wrapper.appendChild(labelEl);
        this.statsEl.appendChild(wrapper);
        return;
      }
      const card = this.statsEl.createDiv({ cls: 'summary-stat' })!;
      card.createDiv?.({ cls: 'summary-stat-value', text: value });
      card.createDiv?.({ cls: 'summary-stat-label', text: label });
    };

    createStatCard(String(numSourceFiles), 'Unique Files');
    createStatCard(displayTotalHours.toFixed(2), 'Total Hours');
    // --- END MODIFICATION ---

    if (typeof this.tableBodyEl.empty === 'function') this.tableBodyEl.empty();
    else this.tableBodyEl.textContent = '';

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
      if (typeof pathCell.createSpan === 'function')
        pathCell.createSpan({
          cls: 'file-path-cell',
          text: record.path,
          attr: { title: record.path }
        });
      else pathCell.textContent = record.path;
      // --- END MODIFICATION ---
    });

    this.overlayEl.classList.add('visible');
    this.popupEl.classList.add('visible');
    const body = this.app.workspace.containerEl.ownerDocument.body;
    body.classList.add('no-scroll');
  };

  public hide = () => {
    this.overlayEl.classList.remove('visible');
    this.popupEl.classList.remove('visible');
    const body = this.app.workspace.containerEl.ownerDocument.body;
    body.classList.remove('no-scroll');
  };
}
