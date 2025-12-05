/**
 * Injects the HTML structure of the analysis dashboard into a given root element.
 * @param rootEl The HTML element to populate.
 */
export function createDOMStructure(rootEl: HTMLElement): void {
  rootEl.innerHTML = `
      <div id="toastContainer"></div>
      <div class="container">
        <div class="header">
          <h1>📊 ChronoAnalyser</h1>
          <p>Interactive analysis of your time tracking data</p>
        </div>

        <!-- --- NEW: Insights Panel --- -->
        <div class="insights-panel" id="insightsPanel">
            <!-- --- NEW: Pro-Tips Section --- -->
            <div class="pro-tips-panel" id="proTipsPanel" title="Click to see the next tip">
                <div class="pro-tips-content">
                    <span class="pro-tips-title">PRO TIP</span>
                    <p id="proTipText"></p>
                </div>
                <div class="pro-tips-nav">›</div>
            </div>
            <!-- --- END: Pro-Tips Section --- -->
            <div class="insights-header">
                <div class="insights-title">💡 Insights</div>
                <div class="insights-actions">
                    <button class="mod-cta" id="generateInsightsBtn">Generate Insights</button>
                    <button id="configureInsightsBtn" class="clickable-icon" aria-label="Configure Insights">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-settings"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </button>
                </div>
            </div>
            <div class="insights-body" id="insightsResultContainer">
                <div class="insights-placeholder">Click "Generate Insights" to analyze your data.</div>
            </div>
        </div>
        <!-- --- END: Insights Panel --- -->

        <div class="controls">
          <!-- Row 1: Hierarchy and Project Filters -->
          <div class="control-group">
            <div class="control-item">
              <label for="hierarchyFilterInput">📂 Filter by Hierarchy (Calendar Source)</label>
              <div class="autocomplete-wrapper">
                <input type="text" id="hierarchyFilterInput" placeholder="All Hierarchies (type to filter...)">
              </div>
            </div>
            <div class="control-item">
              <label for="projectFilterInput">📋 Filter by Project</label>
              <div class="autocomplete-wrapper">
                <input type="text" id="projectFilterInput" placeholder="All Projects (type to filter...)">
              </div>
            </div>
            <!-- NEW LOCATION FOR THE UNIVERSAL FILTER -->
            <div class="control-item" id="categoryFilterContainer">
              <label for="patternInput">🔍 Filter by Category (e.g., keyword -exclude)</label>
              <input type="text" id="patternInput" placeholder="e.g., Task.* -review">
            </div>
          </div>

          <!-- Row 2: Date Filters -->
          <div class="control-group">
            <div class="control-item">
              <label for="dateRangePicker">📅 Date Range</label>
              <input type="text" id="dateRangePicker" placeholder="Select Date Range (YYYY-MM-DD to YYYY-MM-DD)">
              <div class="date-preset-buttons" style="margin-top:10px;">
                <button id="setTodayBtn">Today</button>
                <button id="setYesterdayBtn">Yesterday</button>
                <button id="setThisWeekBtn">This Week</button>
                <button id="setThisMonthBtn">This Month</button>
                <button class="clear-dates-btn" id="clearDatesBtn" title="Clear date filters">
                  🗑️ Clear Dates
                </button>
              </div>
            </div>
          </div>

          <!-- Row 3: Analysis Selection & Configuration -->
          <div class="control-group analysis-config-group">
             <!-- NEW: Metric Selection -->
            <div class="control-item">
              <label for="metricSelect">📏 Metric</label>
              <select id="metricSelect">
                <option value="duration">Duration (Hours)</option>
                <option value="count">Event Count</option>
              </select>
            </div>

            <div class="control-item">
              <label for="analysisTypeSelect">🎯 Analysis Type</label>
              <select id="analysisTypeSelect">
                <option value="pie" title="Visualize how time is distributed across different categories.">Categorywise (Pie)</option>
                <option value="sunburst" title="Visualize how time is distributed across different categories.">Categorywise (Sunburst)</option>
                <option value="time-series" title="Visualize how time spent changes over a period.">Time-Series Trend</option>
                <option value="activity" title="Identify patterns in when tasks are typically performed.">Activity Patterns</option>
              </select>
            </div>

            <!-- Pie Chart Specific -->
            <div class="control-item hidden-controls" id="pieBreakdownLevelContainer">
              <label for="levelSelect_pie">📈 Breakdown Level</label>
              <select id="levelSelect_pie">
                <option value="hierarchy">Hierarchy</option>
                <option value="project">Project</option>
                <option value="subproject">Sub-project</option>
              </select>
            </div>
            <!-- Sunburst Chart Specific -->
            <div class="control-item hidden-controls" id="sunburstBreakdownLevelContainer">
              <label for="levelSelect">📈 Breakdown Level</label>
              <select id="levelSelect">
                <option value="project">Projects by Hierarchy</option>
                <option value="subproject">Sub-projects by Project</option>
              </select>
            </div>

            <!-- Time-Series Specific -->
            <div class="control-item hidden-controls" id="timeSeriesGranularityContainer">
              <label for="timeSeriesGranularitySelect">🕒 Granularity</label>
              <select id="timeSeriesGranularitySelect">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div class="control-item hidden-controls" id="timeSeriesTypeContainer">
              <label for="timeSeriesTypeSelect">📊 Chart Type</label>
              <select id="timeSeriesTypeSelect">
                <option value="line">Overall Trend</option>
                <option value="stackedArea">Stacked by Category</option>
              </select>
            </div>
            <div class="control-item hidden-controls" id="timeSeriesStackingLevelContainer">
              <label for="timeSeriesStackingLevelSelect">📚 Stack By</label>
              <select id="timeSeriesStackingLevelSelect">
                <option value="hierarchy">Hierarchy</option>
                <option value="project">Project</option>
                <option value="subproject">Sub-project</option>
              </select>
            </div>

            <!-- Activity Pattern Specific -->
            <div class="control-item hidden-controls" id="activityPatternTypeContainer">
              <label for="activityPatternTypeSelect">📅 Analyze by</label>
              <select id="activityPatternTypeSelect">
                <option value="dayOfWeek" title="Displays a bar chart showing the total hours spent on each day of the week.">Day of Week</option>
                <option value="hourOfDay" title="Displays a bar chart showing the total hours associated with tasks that start in each hour of the day.">Hour of Day (Task Start)</option>
                <option value="heatmapDOWvsHOD" title="Displays a heatmap where rows are days of the week, columns are hours of the day, and the color intensity of each cell represents the total hours for tasks starting at that specific day/hour combination.">Heatmap (Day vs Hour)</option>
              </select>
            </div>
          </div>
        </div>

        <div class="dashboard-layout-container">
          <div class="stats-grid hidden-controls" id="statsGrid">
            <div class="stat-card">
              <div class="stat-value" id="totalHours">0</div>
              <div class="stat-label">Total Hours (Filtered)</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="totalFiles">0</div>
              <div class="stat-label">Files in Filter</div>
            </div>
            <div class="stat-card">
              <div class="stat-value small-text" id="currentAnalysisTypeStat">N/A</div>
              <div class="stat-label">Active Analysis</div>
            </div>
          </div>
          <div class="main-chart-container hidden-controls" id="mainChartContainer">
            <div id="mainChart"></div>
          </div>
        </div>

        <div class="log-container hidden-controls" id="errorLogContainer">
          <h2>📋 Processing Log & Issues</h2>
          <div id="cacheStatusDisplay" class="log-summary hidden-controls">
          </div>
          <div class="log-summary" id="errorLogSummary">No issues found.</div>
          <div id="errorLogEntries"></div>
        </div>

        <div class="overlay" id="detailOverlay"></div>
        <div class="detail-popup" id="detailPopup">
          <div class="popup-header">
            <h2 class="popup-title" id="popupTitle">Category Details</h2>
            <button class="close-btn" id="popupCloseBtn" title="Close">×</button>
          </div>
          <div class="popup-body">
            <div class="summary-stats" id="popupSummaryStats"></div>
            <div class="detail-table-container">
              <table class="detail-table" id="popupDetailTable">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Sub-project (Full)</th>
                    <th>Duration (hrs)</th>
                    <th>Date</th>
                    <th>File Path</th>
                  </tr>
                </thead>
                <tbody id="popupTableBody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
}
