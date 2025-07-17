// src/chrono_analyser/modules/DataManager.ts

/**
 * @file Manages the state of all parsed TimeRecords, providing indexed lookups and efficient filtering.
 * This class is the single source of truth for all analytical data.
 */

import { TimeRecord } from './types';
import * as Utils from './utils';

export interface AnalysisFilters {
  hierarchy?: string;
  project?: string;
  filterStartDate?: Date | null;
  filterEndDate?: Date | null;
  pattern?: string;
}

/**
 * The result of a full analysis query, including aggregated data.
 */
export interface AnalysisResult {
  records: TimeRecord[];
  totalHours: number;
  fileCount: number;
  // A map of category names to the sum of hours for that category.
  aggregation: Map<string, number>;
  // A map of category names to the list of records belonging to that category.
  recordsByCategory: Map<string, TimeRecord[]>;
  error: string | null;
}

/**
 * A stateful class that holds all time records and provides indexed,
 * high-performance filtering and aggregation in a single pass.
 */
export class DataManager {
  #records: Map<string, TimeRecord> = new Map();
  #hierarchyIndex: Map<string, Set<string>> = new Map();
  #projectIndex: Map<string, Set<string>> = new Map();

  #originalHierarchyCasing: Map<string, string> = new Map();
  #originalProjectCasing: Map<string, string> = new Map();

  public clear(): void {
    this.#records.clear();
    this.#hierarchyIndex.clear();
    this.#projectIndex.clear();
    this.#originalHierarchyCasing.clear();
    this.#originalProjectCasing.clear();
  }

  public addRecord(record: TimeRecord): void {
    if (this.#records.has(record.path)) {
      this.removeRecord(record.path);
    }
    this.#records.set(record.path, record);

    const hierarchyKey = record.hierarchy.toLowerCase();
    if (!this.#hierarchyIndex.has(hierarchyKey)) {
      this.#hierarchyIndex.set(hierarchyKey, new Set());
      this.#originalHierarchyCasing.set(hierarchyKey, record.hierarchy);
    }
    this.#hierarchyIndex.get(hierarchyKey)!.add(record.path);

    const projectKey = record.project.toLowerCase();
    if (!this.#projectIndex.has(projectKey)) {
      this.#projectIndex.set(projectKey, new Set());
      this.#originalProjectCasing.set(projectKey, record.project);
    }
    this.#projectIndex.get(projectKey)!.add(record.path);
  }

  /**
   * Must be called after all records are added.
   * (Currently empty, but kept for future optimizations like sorting indexes).
   */
  public finalize(): void {
    // No-op for now. Date index has been removed in favor of a more robust filter logic.
  }

  public removeRecord(filePath: string): void {
    const record = this.#records.get(filePath);
    if (!record) return;

    const hierarchyKey = record.hierarchy.toLowerCase();
    const projectKey = record.project.toLowerCase();
    const hierarchyPaths = this.#hierarchyIndex.get(hierarchyKey);
    if (hierarchyPaths) {
      hierarchyPaths.delete(filePath);
      if (hierarchyPaths.size === 0) {
        this.#hierarchyIndex.delete(hierarchyKey);
        this.#originalHierarchyCasing.delete(hierarchyKey);
      }
    }
    const projectPaths = this.#projectIndex.get(projectKey);
    if (projectPaths) {
      projectPaths.delete(filePath);
      if (projectPaths.size === 0) {
        this.#projectIndex.delete(projectKey);
        this.#originalProjectCasing.delete(projectKey);
      }
    }
    this.#records.delete(filePath);
  }

  public getKnownHierarchies = (): string[] =>
    Array.from(this.#originalHierarchyCasing.values()).sort();
  public getKnownProjects = (): string[] => Array.from(this.#originalProjectCasing.values()).sort();
  public getTotalRecordCount = (): number => this.#records.size;

  /**
   * Performs a high-performance, single-pass filter AND aggregation of the data.
   * This is the primary query method for the analyzer.
   * @param filters - The filter criteria to apply.
   * @param breakdownBy - The TimeRecord property to use for aggregation/categorization.
   * @returns An AnalysisResult object containing filtered records, stats, and aggregated data.
   */
  public getAnalyzedData(
    filters: AnalysisFilters,
    breakdownBy: keyof TimeRecord | null
  ): AnalysisResult {
    const result: AnalysisResult = {
      records: [],
      totalHours: 0,
      fileCount: 0,
      aggregation: new Map(),
      recordsByCategory: new Map(),
      error: null
    };
    let regex: RegExp | null = null;

    if (filters.pattern) {
      try {
        regex = new RegExp(filters.pattern, 'i');
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
        return result;
      }
    }

    // --- NEW FILTERING LOGIC ---
    // 1. Get a set of candidate paths using the fastest non-date indexes first.
    let candidatePaths: Set<string> | null = null;

    if (filters.hierarchy) {
      const hierarchyKey = filters.hierarchy.toLowerCase();
      candidatePaths = this.#hierarchyIndex.get(hierarchyKey) || new Set();
    }

    if (filters.project) {
      const projectKey = filters.project.toLowerCase();
      const projectPaths = this.#projectIndex.get(projectKey) || new Set();
      // Intersect with existing candidates or use as the primary filter
      candidatePaths = candidatePaths
        ? new Set([...candidatePaths].filter(path => projectPaths.has(path)))
        : projectPaths;
    }

    // 2. Determine which records to scan. If we have candidates, use them. Otherwise, scan all.
    const recordsToScan: Iterable<TimeRecord> = candidatePaths
      ? Array.from(candidatePaths)
          .map(path => this.#records.get(path)!)
          .filter(Boolean)
      : this.#records.values();

    const uniqueFiles = new Set<string>();
    const startDate = filters.filterStartDate ?? null;
    const endDate = filters.filterEndDate ?? null;
    const hasDateFilter = !!(startDate || endDate);

    // 3. Loop through the candidates and apply the date filter logic.
    for (const record of recordsToScan) {
      let effectiveDuration = 0;
      let includeRecord = false;

      if (record.metadata.type === 'recurring') {
        if (hasDateFilter) {
          const numInstances = Utils.calculateRecurringInstancesInDateRange(
            record.metadata,
            startDate,
            endDate
          );
          if (numInstances > 0) {
            effectiveDuration = record.duration * numInstances;
            includeRecord = true;
          }
        } else {
          // If no date filter, recurring events are conceptually "infinite"
          // We can't sum them, so we exclude them from totals unless a date range is specified.
          // For charts, we use their base duration. Here we choose to exclude from totals.
          // Let's decide to include them with a single instance duration for non-date-filtered views.
          effectiveDuration = record.duration;
          includeRecord = true;
        }
      } else {
        // It's a single, dated event
        if (hasDateFilter) {
          if (this.isWithinDateRange(record.date, startDate, endDate)) {
            effectiveDuration = record.duration;
            includeRecord = true;
          }
        } else {
          // No date filter, so include all single events
          effectiveDuration = record.duration;
          includeRecord = true;
        }
      }

      if (includeRecord && effectiveDuration > 0) {
        const finalRecord = { ...record, _effectiveDurationInPeriod: effectiveDuration };

        if (breakdownBy) {
          const key = String(record[breakdownBy] || `(No ${breakdownBy})`);
          if (regex && !regex.test(key)) {
            continue;
          }
          result.aggregation.set(key, (result.aggregation.get(key) || 0) + effectiveDuration);
          if (!result.recordsByCategory.has(key)) result.recordsByCategory.set(key, []);
          result.recordsByCategory.get(key)!.push(finalRecord);
        }

        result.records.push(finalRecord);
        result.totalHours += effectiveDuration;
        uniqueFiles.add(record.path);
      }
    }

    result.fileCount = uniqueFiles.size;
    return result;
  }

  /**
   * Simple, robust check if a record's date falls within a range.
   * Handles inclusive start/end dates.
   */
  private isWithinDateRange(
    recordDate: Date | null,
    startDate: Date | null,
    endDate: Date | null
  ): boolean {
    if (!recordDate || isNaN(recordDate.getTime())) return false;

    // Use a date-only comparison by zeroing out time parts.
    const recordTime = new Date(recordDate.valueOf());
    recordTime.setUTCHours(0, 0, 0, 0);
    const recordTimestamp = recordTime.getTime();

    if (startDate) {
      const startTime = new Date(startDate.valueOf());
      startTime.setUTCHours(0, 0, 0, 0);
      if (recordTimestamp < startTime.getTime()) return false;
    }
    if (endDate) {
      const endTime = new Date(endDate.valueOf());
      endTime.setUTCHours(0, 0, 0, 0);
      if (recordTimestamp > endTime.getTime()) return false;
    }

    return true;
  }
}
