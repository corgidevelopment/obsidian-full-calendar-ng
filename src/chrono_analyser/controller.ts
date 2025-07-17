// src/chrono_analyser/controller.ts

/**
 * @file The main orchestrator for the Chrono Analyser.
 * This class connects the DataService and UIService, managing the flow of data
 * from the main plugin's EventCache and triggering UI updates in response.
 */

import { App, Notice, TFolder } from 'obsidian';
import FullCalendarPlugin from 'src/main';
import * as Plotter from './modules/plotter';
import * as Aggregator from './modules/aggregator';
import { DataManager } from './modules/DataManager';
import { UIService } from './modules/UIService';
import { DataService } from './modules/DataService';
import { PieData, TimeRecord } from './modules/types';

interface IChartStrategy {
  analysisName: string;
  render(
    controller: AnalysisController,
    useReact: boolean,
    filteredRecords: TimeRecord[],
    isNewChartType: boolean
  ): void;
}

export class AnalysisController {
  public uiService: UIService;
  public dataService: DataService;
  public dataManager: DataManager;
  public rootEl: HTMLElement;

  private activeChartType: string | null = null;
  private isChartRendered = false;

  private activePieBreakdown: string | null = null;
  private activeSunburstLevel: string | null = null;
  private activeTimeSeriesGranularity: string | null = null;
  private activeTimeSeriesType: string | null = null;
  private activeActivityPattern: string | null = null;

  constructor(
    private app: App,
    rootEl: HTMLElement,
    private plugin: FullCalendarPlugin
  ) {
    this.rootEl = rootEl;
    this.dataManager = new DataManager();
    this.uiService = new UIService(app, rootEl, () => this.updateAnalysis());
    this.dataService = new DataService(this.plugin.cache, this.dataManager, () =>
      this.handleDataReady()
    );
  }

  /**
   * Initializes all services. Crucially, it checks if the main plugin's
   * event cache has been populated and triggers it if not.
   */
  public async initialize(): Promise<void> {
    this.uiService.initialize();

    // --- THIS IS THE KEY FIX ---
    // Check if the main EventCache has been populated.
    if (!this.plugin.cache.initialized) {
      // If not, it means this view is loading before the main calendar view.
      // We must take responsibility for populating the cache.
      new Notice('Chrono Analyser: Initializing event cache...', 2000);
      await this.plugin.cache.populate();
    }
    // --- END OF FIX ---

    // Now that we're sure the cache is either populated or will be soon,
    // we can initialize our data service, which subscribes to it and
    // performs an initial data pull.
    this.dataService.initialize();
  }

  public destroy(): void {
    this.uiService.destroy();
    this.dataService.destroy();
  }

  private handleDataReady(): void {
    this.activeChartType = null;
    this.isChartRendered = false;
    this.uiService.populateFilterDataSources(
      () => this.dataManager.getKnownHierarchies(),
      () => this.dataManager.getKnownProjects()
    );
    this.updateAnalysis();
  }

  private updateAnalysis(): void {
    this.uiService.saveState(null);

    const { filters, newChartType } = this.uiService.getFilterState();
    const chartSpecificFilters = this.uiService.getChartSpecificFilter(newChartType);

    const isNewChartType = this.activeChartType !== newChartType;
    let useReact = !isNewChartType && this.isChartRendered;

    if (!isNewChartType) {
      switch (newChartType) {
        case 'pie':
          if (this.activePieBreakdown !== chartSpecificFilters.breakdownBy) useReact = false;
          break;
        case 'sunburst':
          if (this.activeSunburstLevel !== chartSpecificFilters.level) useReact = false;
          break;
        case 'time-series':
          if (
            this.activeTimeSeriesGranularity !== chartSpecificFilters.granularity ||
            this.activeTimeSeriesType !== chartSpecificFilters.type
          )
            useReact = false;
          break;
        case 'activity':
          if (this.activeActivityPattern !== chartSpecificFilters.patternType) useReact = false;
          break;
      }
    }

    filters.pattern = chartSpecificFilters.pattern;
    const { records, totalHours, fileCount } = this.dataManager.getAnalyzedData(filters, null);

    this.renderUI(records, totalHours, fileCount, useReact, isNewChartType);

    this.activeChartType = newChartType;
    this.activePieBreakdown = newChartType === 'pie' ? chartSpecificFilters.breakdownBy : null;
    this.activeSunburstLevel = newChartType === 'sunburst' ? chartSpecificFilters.level : null;
    this.activeTimeSeriesGranularity =
      newChartType === 'time-series' ? chartSpecificFilters.granularity : null;
    this.activeTimeSeriesType = newChartType === 'time-series' ? chartSpecificFilters.type : null;
    this.activeActivityPattern =
      newChartType === 'activity' ? chartSpecificFilters.patternType : null;
  }

  private renderUI(
    filteredRecords: TimeRecord[],
    totalHours: number,
    fileCount: number,
    useReact: boolean,
    isNewChartType: boolean
  ) {
    Plotter.renderErrorLog(this.rootEl, [], this.dataManager.getTotalRecordCount());

    if (this.dataManager.getTotalRecordCount() === 0) {
      this.uiService.hideMainContainers();
      Plotter.renderChartMessage(
        this.rootEl,
        'No time-tracking events found in your configured Full Calendar sources.'
      );
      this.isChartRendered = false;
      return;
    }

    this.uiService.showMainContainers();

    if (filteredRecords.length === 0) {
      this.uiService.renderStats('-', '-');
      this.uiService.updateActiveAnalysisStat('N/A');
      Plotter.renderChartMessage(this.rootEl, 'No data matches the current filters.');
      this.isChartRendered = false; // The chart was purged
      return;
    }

    this.uiService.renderStats(totalHours, fileCount);

    const { newChartType } = this.uiService.getFilterState();
    const chartStrategies = this.createChartStrategies();
    const strategy = chartStrategies.get(newChartType!);

    if (strategy) {
      this.uiService.updateActiveAnalysisStat(strategy.analysisName);
      strategy.render(this, useReact, filteredRecords, isNewChartType);
      this.isChartRendered = true;
    } else {
      Plotter.renderChartMessage(this.rootEl, `Unknown chart type: ${newChartType}`);
      this.isChartRendered = false;
    }
  }

  private createChartStrategies(): Map<string, IChartStrategy> {
    const strategies = new Map<string, IChartStrategy>();

    strategies.set('pie', {
      analysisName: 'Category Breakdown',
      render(
        controller: AnalysisController,
        useReact: boolean,
        filteredRecords: TimeRecord[],
        isNewChartType: boolean
      ) {
        const pieFilters = controller.uiService.getChartSpecificFilter('pie');
        const { aggregation, recordsByCategory, error } = controller.dataManager.getAnalyzedData(
          { ...controller.uiService.getFilterState().filters, pattern: pieFilters.pattern },
          pieFilters.breakdownBy
        );
        if (error) {
          Plotter.renderChartMessage(controller.rootEl, `Regex Error: ${error}`);
          return;
        }
        const pieData: PieData = { hours: aggregation, recordsByCategory, error: false };
        Plotter.renderPieChartDisplay(
          controller.rootEl,
          pieData,
          controller.uiService.showDetailPopup,
          useReact,
          isNewChartType
        );
      }
    });

    strategies.set('sunburst', {
      analysisName: 'Hierarchical Breakdown',
      render(
        controller: AnalysisController,
        useReact: boolean,
        filteredRecords: TimeRecord[],
        isNewChartType: boolean
      ) {
        const sunburstFilters = controller.uiService.getChartSpecificFilter('sunburst');
        const sunburstData = Aggregator.aggregateForSunburst(
          filteredRecords,
          sunburstFilters.level
        );
        Plotter.renderSunburstChartDisplay(
          controller.rootEl,
          sunburstData,
          controller.uiService.showDetailPopup,
          useReact,
          isNewChartType
        );
      }
    });

    strategies.set('time-series', {
      analysisName: 'Time-Series Trend',
      render(
        controller: AnalysisController,
        useReact: boolean,
        filteredRecords: TimeRecord[],
        isNewChartType: boolean
      ) {
        const { filters } = controller.uiService.getFilterState();
        const filterDates = {
          filterStartDate: filters.filterStartDate ?? null,
          filterEndDate: filters.filterEndDate ?? null
        };
        Plotter.renderTimeSeriesChart(
          controller.rootEl,
          filteredRecords,
          filterDates,
          useReact,
          isNewChartType
        );
      }
    });

    strategies.set('activity', {
      analysisName: 'Activity Patterns',
      render(
        controller: AnalysisController,
        useReact: boolean,
        filteredRecords: TimeRecord[],
        isNewChartType: boolean
      ) {
        const { filters } = controller.uiService.getFilterState();
        const filterDates = {
          filterStartDate: filters.filterStartDate ?? null,
          filterEndDate: filters.filterEndDate ?? null
        };
        Plotter.renderActivityPatternChart(
          controller.rootEl,
          filteredRecords,
          filterDates,
          controller.uiService.showDetailPopup,
          useReact,
          isNewChartType
        );
      }
    });

    return strategies;
  }
}
