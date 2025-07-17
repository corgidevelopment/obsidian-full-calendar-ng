/**
 * @file Manages all DOM interactions, UI state, and event handling for the Chrono Analyser view.
 * This service acts as the interface between the user and the application, abstracting all direct
 * DOM manipulation away from the controller.
 */

import { App, debounce, TFolder } from 'obsidian';
import flatpickr from 'flatpickr';
import { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import * as UI from './ui';
import { AnalysisFilters } from './DataManager';
import { TimeRecord } from './types';
import * as Utils from './utils';

/**
 * Manages all DOM interactions, UI state, and event handling for the Chrono Analyser view.
 */
export class UIService {
  private flatpickrInstance: FlatpickrInstance | null = null;
  private uiStateKey = 'ChronoAnalyzerUIState_v5'; // Incremented version

  // CORRECTED CONSTRUCTOR: Removed obsolete parameters
  constructor(
    private app: App,
    private rootEl: HTMLElement,
    private onFilterChange: () => void // Callback to trigger analysis
  ) {}

  /**
   * Initializes all UI components and event listeners.
   */
  public initialize(): void {
    this.setupEventListeners();
    this.loadFilterState();
  }

  /**
   * Cleans up UI components to prevent memory leaks.
   */
  public destroy(): void {
    this.flatpickrInstance?.destroy();
  }

  /**
   * Reads the current state of all filter controls in the UI.
   * @returns An object containing a clean AnalysisFilters object and the selected chart type.
   */
  public getFilterState(): { filters: AnalysisFilters; newChartType: string | null } {
    const hierarchyFilter =
      this.rootEl
        .querySelector<HTMLInputElement>('#hierarchyFilterInput')
        ?.value.trim()
        .toLowerCase() || undefined;
    const projectFilter =
      this.rootEl
        .querySelector<HTMLInputElement>('#projectFilterInput')
        ?.value.trim()
        .toLowerCase() || undefined;
    const dates = this.flatpickrInstance?.selectedDates;
    const filterStartDate = dates && dates.length === 2 ? dates[0] : null;
    const filterEndDate = dates && dates.length === 2 ? dates[1] : null;

    const filters: AnalysisFilters = {
      hierarchy: hierarchyFilter,
      project: projectFilter,
      filterStartDate,
      filterEndDate
    };
    const newChartType =
      this.rootEl.querySelector<HTMLSelectElement>('#analysisTypeSelect')?.value ?? null;

    return { filters, newChartType };
  }

  /**
   * Gets specific filter values required by certain chart types.
   * @param type - The chart type being rendered.
   * @returns A record of chart-specific filter values.
   */
  public getChartSpecificFilter(type: string | null): Record<string, any> {
    switch (type) {
      case 'pie':
        return {
          breakdownBy: (this.rootEl.querySelector<HTMLSelectElement>('#levelSelect_pie')?.value ||
            'hierarchy') as keyof TimeRecord,
          pattern: this.rootEl.querySelector<HTMLInputElement>('#patternInput')?.value ?? ''
        };
      case 'sunburst':
        return {
          level: this.rootEl.querySelector<HTMLSelectElement>('#levelSelect')?.value ?? '',
          pattern: this.rootEl.querySelector<HTMLInputElement>('#patternInput')?.value ?? ''
        };
      case 'time-series':
        return {
          granularity:
            this.rootEl.querySelector<HTMLSelectElement>('#timeSeriesGranularitySelect')?.value ??
            'daily',
          type:
            this.rootEl.querySelector<HTMLSelectElement>('#timeSeriesTypeSelect')?.value ?? 'line'
        };
      case 'activity':
        return {
          patternType:
            this.rootEl.querySelector<HTMLSelectElement>('#activityPatternTypeSelect')?.value ??
            'dayOfWeek'
        };
      default:
        return {};
    }
  }

  /**
   * Updates the statistical display cards.
   * @param totalHours - The total hours to display. Can be a number or placeholder string.
   * @param fileCount - The number of files to display. Can be a number or placeholder string.
   */
  public renderStats(totalHours: number | string, fileCount: number | string): void {
    (this.rootEl.querySelector('#totalHours') as HTMLElement).textContent =
      typeof totalHours === 'number' ? totalHours.toFixed(2) : totalHours;
    (this.rootEl.querySelector('#totalFiles') as HTMLElement).textContent = String(fileCount);
  }

  /**
   * Updates the "Active Analysis" stat card.
   * @param name - The name of the currently active analysis.
   */
  public updateActiveAnalysisStat(name: string): void {
    const el = this.rootEl.querySelector('#currentAnalysisTypeStat') as HTMLElement;
    if (el) el.textContent = name;
  }

  public showMainContainers(): void {
    this.rootEl.querySelector<HTMLElement>('#statsGrid')!.style.display = '';
    this.rootEl.querySelector<HTMLElement>('#mainChartContainer')!.style.display = '';
  }

  public hideMainContainers(): void {
    this.rootEl.querySelector<HTMLElement>('#statsGrid')!.style.display = 'none';
    this.rootEl.querySelector<HTMLElement>('#mainChartContainer')!.style.display = 'none';
  }

  /**
   * Sets up all event listeners for the view's interactive elements.
   */
  private setupEventListeners = () => {
    // CORRECTED: Removed listeners for non-existent buttons
    const datePickerEl = this.rootEl.querySelector<HTMLInputElement>('#dateRangePicker');
    if (datePickerEl) {
      this.flatpickrInstance = flatpickr(datePickerEl, {
        mode: 'range',
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'M j, Y',
        onChange: this.onFilterChange
      });
    }

    this.rootEl.querySelector('#clearDatesBtn')?.addEventListener('click', this.clearDateFilters);
    this.rootEl
      .querySelector('#setTodayBtn')
      ?.addEventListener('click', () => this.setPresetDateRange('today'));
    this.rootEl
      .querySelector('#setYesterdayBtn')
      ?.addEventListener('click', () => this.setPresetDateRange('yesterday'));
    this.rootEl
      .querySelector('#setThisWeekBtn')
      ?.addEventListener('click', () => this.setPresetDateRange('thisWeek'));
    this.rootEl
      .querySelector('#setThisMonthBtn')
      ?.addEventListener('click', () => this.setPresetDateRange('thisMonth'));
    this.rootEl
      .querySelector('#analysisTypeSelect')
      ?.addEventListener('change', () => this.handleAnalysisTypeChange());
    this.rootEl.querySelector('#levelSelect_pie')?.addEventListener('change', this.onFilterChange);
    this.rootEl.querySelector('#levelSelect')?.addEventListener('change', this.onFilterChange);
    this.rootEl
      .querySelector('#patternInput')
      ?.addEventListener('input', debounce(this.onFilterChange, 300));
    this.rootEl
      .querySelector('#timeSeriesGranularitySelect')
      ?.addEventListener('change', this.onFilterChange);
    this.rootEl.querySelector('#timeSeriesTypeSelect')?.addEventListener('change', () => {
      this.handleTimeSeriesTypeVis();
      this.onFilterChange();
    });
    this.rootEl
      .querySelector('#timeSeriesStackingLevelSelect')
      ?.addEventListener('change', this.onFilterChange);
    this.rootEl
      .querySelector('#activityPatternTypeSelect')
      ?.addEventListener('change', this.onFilterChange);
    this.rootEl.querySelector('#popupCloseBtn')?.addEventListener('click', this.hideDetailPopup);
    this.rootEl.querySelector('#detailOverlay')?.addEventListener('click', this.hideDetailPopup);
  };

  public showDetailPopup = (categoryName: string, recordsList: TimeRecord[], context: any = {}) => {
    const popupTitleEl = this.rootEl.querySelector<HTMLElement>('#popupTitle');
    const popupSummaryStatsEl = this.rootEl.querySelector<HTMLElement>('#popupSummaryStats');
    const tableBody = this.rootEl.querySelector<HTMLTableSectionElement>('#popupTableBody');
    const detailOverlay = this.rootEl.querySelector<HTMLElement>('#detailOverlay');
    const detailPopup = this.rootEl.querySelector<HTMLElement>('#detailPopup');
    const popupBodyEl = this.rootEl.querySelector<HTMLElement>('.popup-body');
    if (
      !popupTitleEl ||
      !popupSummaryStatsEl ||
      !tableBody ||
      !detailOverlay ||
      !detailPopup ||
      !popupBodyEl
    )
      return;
    popupBodyEl.scrollTop = 0;
    popupTitleEl.textContent = `Details for: ${categoryName}`;
    const numSourceFiles = new Set(recordsList.map(r => r.path)).size;
    const displayTotalHours =
      context.value ??
      recordsList.reduce(
        (sum: number, r: TimeRecord) => sum + (r._effectiveDurationInPeriod || 0),
        0
      );
    popupSummaryStatsEl.innerHTML = `<div class="summary-stat"><div class="summary-stat-value">${numSourceFiles}</div><div class="summary-stat-label">Unique Files</div></div><div class="summary-stat"><div class="summary-stat-value">${displayTotalHours.toFixed(2)}</div><div class="summary-stat-label">Total Hours</div></div>`;
    tableBody.innerHTML = '';
    recordsList.forEach(record => {
      const row = tableBody.insertRow();
      row.insertCell().innerHTML = `<span class="file-path-cell" title="${record.path}">${record.path}</span>`;
      const dateCell = row.insertCell();
      dateCell.textContent = record.date ? Utils.getISODate(record.date) : 'Recurring';
      row.insertCell().textContent = (record._effectiveDurationInPeriod || record.duration).toFixed(
        2
      );
      row.insertCell().textContent = record.project;
      row.insertCell().textContent = record.subprojectFull;
    });
    detailOverlay.classList.add('visible');
    detailPopup.classList.add('visible');
    this.app.workspace.containerEl.ownerDocument.body.style.overflow = 'hidden';
  };

  public hideDetailPopup = () => {
    const detailOverlay = this.rootEl.querySelector<HTMLElement>('#detailOverlay');
    const detailPopup = this.rootEl.querySelector<HTMLElement>('#detailPopup');
    if (detailOverlay) detailOverlay.classList.remove('visible');
    if (detailPopup) detailPopup.classList.remove('visible');
    this.app.workspace.containerEl.ownerDocument.body.style.overflow = '';
  };

  public saveState = (lastFolderPath: string | null) => {
    const getElValue = (id: string) =>
      this.rootEl.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value;
    const state: any = {
      // lastFolderPath is no longer needed
      analysisTypeSelect: getElValue('analysisTypeSelect'),
      hierarchyFilter: getElValue('hierarchyFilterInput'),
      projectFilter: getElValue('projectFilterInput'),
      levelSelect_pie: getElValue('levelSelect_pie'),
      levelSelect: getElValue('levelSelect'),
      patternInput: getElValue('patternInput'),
      timeSeriesGranularity: getElValue('timeSeriesGranularitySelect'),
      timeSeriesType: getElValue('timeSeriesTypeSelect'),
      timeSeriesStackingLevel: getElValue('timeSeriesStackingLevelSelect'),
      activityPatternType: getElValue('activityPatternTypeSelect')
    };
    if (this.flatpickrInstance && this.flatpickrInstance.selectedDates.length === 2) {
      state.startDate = Utils.getISODate(this.flatpickrInstance.selectedDates[0]);
      state.endDate = Utils.getISODate(this.flatpickrInstance.selectedDates[1]);
    } else {
      state.startDate = '';
      state.endDate = '';
    }
    localStorage.setItem(
      this.uiStateKey,
      JSON.stringify(Object.fromEntries(Object.entries(state).filter(([_, v]) => v != null)))
    );
  };

  private loadFilterState = () => {
    const savedState = localStorage.getItem(this.uiStateKey);
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        const setVal = (id: string, val: string | undefined) => {
          const el = this.rootEl.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
          if (el && val !== undefined) el.value = val;
        };
        setVal('analysisTypeSelect', state.analysisTypeSelect);
        setVal('hierarchyFilterInput', state.hierarchyFilter);
        setVal('projectFilterInput', state.projectFilter);
        if (state.startDate && state.endDate && this.flatpickrInstance) {
          setTimeout(
            () => this.flatpickrInstance?.setDate([state.startDate, state.endDate], false),
            0
          );
        }
        setVal('levelSelect_pie', state.levelSelect_pie);
        setVal('levelSelect', state.levelSelect);
        setVal('patternInput', state.patternInput);
        setVal('timeSeriesGranularitySelect', state.timeSeriesGranularity);
        setVal('timeSeriesTypeSelect', state.timeSeriesType);
        setVal('timeSeriesStackingLevelSelect', state.timeSeriesStackingLevel);
        setVal('activityPatternTypeSelect', state.activityPatternType);
        this.handleAnalysisTypeChange(false);
      } catch (error) {
        console.error('[ChronoAnalyzer] Error loading UI state:', error);
        localStorage.removeItem(this.uiStateKey);
      }
    }
  };

  private handleAnalysisTypeChange = (triggerAnalysis = true) => {
    const analysisType = this.rootEl.querySelector<HTMLSelectElement>('#analysisTypeSelect')?.value;
    const specificControlContainers = [
      'sunburstBreakdownLevelContainer',
      'pieBreakdownLevelContainer',
      'pieCategoryFilterContainer',
      'timeSeriesGranularityContainer',
      'timeSeriesTypeContainer',
      'timeSeriesStackingLevelContainer',
      'activityPatternTypeContainer'
    ];
    specificControlContainers.forEach(id =>
      this.rootEl.querySelector(`#${id}`)?.classList.add('hidden-controls')
    );
    if (analysisType === 'sunburst') {
      this.rootEl
        .querySelector('#sunburstBreakdownLevelContainer')
        ?.classList.remove('hidden-controls');
      this.rootEl.querySelector('#pieCategoryFilterContainer')?.classList.remove('hidden-controls');
    } else if (analysisType === 'pie') {
      this.rootEl.querySelector('#pieBreakdownLevelContainer')?.classList.remove('hidden-controls');
      this.rootEl.querySelector('#pieCategoryFilterContainer')?.classList.remove('hidden-controls');
    } else if (analysisType === 'time-series') {
      this.rootEl
        .querySelector('#timeSeriesGranularityContainer')
        ?.classList.remove('hidden-controls');
      this.rootEl.querySelector('#timeSeriesTypeContainer')?.classList.remove('hidden-controls');
      this.handleTimeSeriesTypeVis();
    } else if (analysisType === 'activity') {
      this.rootEl
        .querySelector('#activityPatternTypeContainer')
        ?.classList.remove('hidden-controls');
    }
    if (triggerAnalysis) {
      this.onFilterChange();
    }
  };

  private handleTimeSeriesTypeVis = () => {
    const timeSeriesType =
      this.rootEl.querySelector<HTMLSelectElement>('#timeSeriesTypeSelect')?.value;
    const stackingLevelContainer = this.rootEl.querySelector<HTMLElement>(
      '#timeSeriesStackingLevelContainer'
    );
    if (stackingLevelContainer) {
      stackingLevelContainer.classList.toggle('hidden-controls', timeSeriesType !== 'stackedArea');
    }
  };

  private setPresetDateRange(preset: string) {
    const today = new Date();
    let startDate, endDate;
    switch (preset) {
      case 'today':
        startDate = today;
        endDate = today;
        break;
      case 'yesterday':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 1);
        endDate = startDate;
        break;
      case 'thisWeek':
        startDate = new Date(today);
        const day = today.getDay();
        startDate.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        break;
      case 'thisMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      default:
        return;
    }
    if (this.flatpickrInstance) this.flatpickrInstance.setDate([startDate, endDate], true);
  }

  public clearAllFilters = () => {
    this.rootEl.querySelector<HTMLInputElement>('#hierarchyFilterInput')!.value = '';
    this.rootEl.querySelector<HTMLInputElement>('#projectFilterInput')!.value = '';
    if (this.flatpickrInstance) this.flatpickrInstance.clear(false, false);
  };

  private clearDateFilters = () => {
    if (this.flatpickrInstance) this.flatpickrInstance.clear(true, true);
  };

  public populateFilterDataSources(getHierarchies: () => string[], getProjects: () => string[]) {
    UI.setupAutocomplete(
      this.rootEl,
      'hierarchyFilterInput',
      'hierarchySuggestions',
      getHierarchies,
      this.onFilterChange
    );
    UI.setupAutocomplete(
      this.rootEl,
      'projectFilterInput',
      'projectSuggestions',
      getProjects,
      this.onFilterChange
    );
  }
}
