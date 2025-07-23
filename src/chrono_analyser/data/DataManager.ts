/**
 * @file Manages the state of all parsed TimeRecords, providing indexed lookups and efficient filtering.
 * This class is the single source of truth for all analytical data.
 */

import { TimeRecord } from './types';
import * as Utils from './utils';
import { OFCEvent } from '../../types';

export interface AnalysisFilters {
  hierarchy?: string;
  project?: string;
  filterStartDate?: Date | null;
  filterEndDate?: Date | null;
  pattern?: string;
}

export interface DataManagerOptions {
  /**
   * If true, recurring events will be expanded into individual, dated records.
   * If false (default), they will be returned as a single record with a calculated
   * total duration for the period.
   */
  expandRecurring?: boolean;
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
    // No-op for now.
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

  public getAllRecords(): TimeRecord[] {
    return Array.from(this.#records.values());
  }

  /**
   * Performs a high-performance, single-pass filter AND aggregation of the data.
   * This is the primary query method for the analyzer.
   * @param filters - The filter criteria to apply.
   * @param breakdownBy - The TimeRecord property to use for aggregation/categorization.
   * @param options - Options to control data processing, like expanding recurring events.
   * @returns An AnalysisResult object containing filtered records, stats, and aggregated data.
   */
  public getAnalyzedData(
    filters: AnalysisFilters,
    breakdownBy: keyof TimeRecord | null,
    options: DataManagerOptions = {}
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
    const { expandRecurring = false } = options;

    if (filters.pattern) {
      try {
        regex = new RegExp(filters.pattern, 'i');
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
        return result;
      }
    }

    let candidatePaths: Set<string> | null = null;

    if (filters.hierarchy) {
      const hierarchyKey = filters.hierarchy.toLowerCase();
      candidatePaths = this.#hierarchyIndex.get(hierarchyKey) || new Set();
    }

    if (filters.project) {
      const projectKey = filters.project.toLowerCase();
      const projectPaths = this.#projectIndex.get(projectKey) || new Set();
      candidatePaths = candidatePaths
        ? new Set([...candidatePaths].filter(path => projectPaths.has(path)))
        : projectPaths;
    }

    const recordsToScan: Iterable<TimeRecord> = candidatePaths
      ? Array.from(candidatePaths)
          .map(path => this.#records.get(path)!)
          .filter(Boolean)
      : this.#records.values();

    const uniqueFiles = new Set<string>();
    const startDate = filters.filterStartDate ?? null;
    const endDate = filters.filterEndDate ?? null;
    const hasDateFilter = !!(startDate || endDate);

    for (const record of recordsToScan) {
      if (record.metadata.type === 'recurring' && hasDateFilter) {
        if (expandRecurring) {
          // EXPAND MODE: Create a new record for each instance in the date range.
          const instances = Utils.getRecurringInstances(record, startDate, endDate);
          for (const instanceDate of instances) {
            // When expanding, create a new metadata object that conforms to the SingleEvent shape.
            // This is a type-safe transformation from a RecurringEvent to a SingleEvent.
            let newMetadata: OFCEvent;
            const commonProperties = {
              title: record.metadata.title,
              id: record.metadata.id,
              category: record.metadata.category,
              timezone: record.metadata.timezone,
              type: 'single' as const,
              date: Utils.getISODate(instanceDate)!,
              endDate: Utils.getISODate(instanceDate)!
            };

            if (record.metadata.allDay) {
              // It's an all-day event. startTime and endTime are not allowed.
              newMetadata = {
                ...commonProperties,
                allDay: true
              };
            } else {
              // It's a timed event. startTime and endTime are required.
              newMetadata = {
                ...commonProperties,
                allDay: false,
                startTime: 'startTime' in record.metadata ? record.metadata.startTime : '00:00', // Provide a fallback to satisfy type
                endTime: 'endTime' in record.metadata ? record.metadata.endTime : '00:00' // Provide a fallback to satisfy type
              };
            }

            const instanceRecord: TimeRecord = {
              ...record,
              date: instanceDate, // This instance has a specific date
              metadata: newMetadata, // Use the new, correctly-shaped metadata
              _effectiveDurationInPeriod: record.duration // Duration of a single instance
            };

            this.processRecord(
              instanceRecord,
              record.duration,
              breakdownBy,
              regex,
              result,
              uniqueFiles
            );
          }
        } else {
          // AGGREGATE MODE: Calculate total duration for the single recurring record.
          const numInstances = Utils.calculateRecurringInstancesInDateRange(
            record.metadata,
            startDate,
            endDate
          );
          if (numInstances > 0) {
            const effectiveDuration = record.duration * numInstances;
            const finalRecord = { ...record, _effectiveDurationInPeriod: effectiveDuration };
            this.processRecord(
              finalRecord,
              effectiveDuration,
              breakdownBy,
              regex,
              result,
              uniqueFiles
            );
          }
        }
      } else {
        // Handle single, dated events, or any event if there's no date filter.
        const effectiveDuration = record.duration;
        let includeRecord = false;
        if (record.metadata.type === 'recurring' && !hasDateFilter) {
          // For non-date-filtered views, include recurring events with a single instance duration.
          includeRecord = true;
        } else if (record.metadata.type !== 'recurring') {
          // It's a single, dated event
          if (hasDateFilter) {
            if (this.isWithinDateRange(record.date, startDate, endDate)) {
              includeRecord = true;
            }
          } else {
            includeRecord = true; // No date filter, so include all single events
          }
        }

        if (includeRecord && effectiveDuration > 0) {
          const finalRecord = { ...record, _effectiveDurationInPeriod: effectiveDuration };
          this.processRecord(
            finalRecord,
            effectiveDuration,
            breakdownBy,
            regex,
            result,
            uniqueFiles
          );
        }
      }
    }

    result.fileCount = uniqueFiles.size;
    return result;
  }

  /**
   * Helper function to process a single record (real or expanded) and add it to the result set.
   * This avoids logic duplication within getAnalyzedData.
   */
  private processRecord(
    record: TimeRecord,
    duration: number,
    breakdownBy: keyof TimeRecord | null,
    regex: RegExp | null,
    result: AnalysisResult,
    uniqueFiles: Set<string>
  ): void {
    if (breakdownBy) {
      const key = String(record[breakdownBy] || `(No ${breakdownBy})`);
      if (regex && !regex.test(key)) {
        return; // Skip if it doesn't match the category regex
      }
      result.aggregation.set(key, (result.aggregation.get(key) || 0) + duration);
      if (!result.recordsByCategory.has(key)) result.recordsByCategory.set(key, []);
      result.recordsByCategory.get(key)!.push(record);
    }

    result.records.push(record);
    result.totalHours += duration;
    uniqueFiles.add(record.path);
  }

  private isWithinDateRange(
    recordDate: Date | null,
    startDate: Date | null,
    endDate: Date | null
  ): boolean {
    if (!recordDate || isNaN(recordDate.getTime())) return false;
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
