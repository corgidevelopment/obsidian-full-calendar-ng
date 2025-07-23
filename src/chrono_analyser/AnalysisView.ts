import { ItemView, App, WorkspaceLeaf } from 'obsidian';
import { createDOMStructure } from './ui/dom';
import { AnalysisController } from './AnalysisController';
import FullCalendarPlugin from '../main';

// Importing styles for the AnalysisView
import 'flatpickr/dist/themes/dark.css';
import './ui/styles/styles.css';

export const ANALYSIS_VIEW_TYPE = 'full-calendar-analysis-view';

export class AnalysisView extends ItemView {
  private controller: AnalysisController | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: FullCalendarPlugin
  ) {
    super(leaf);
  }

  getViewType(): string {
    return ANALYSIS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Chrono Analyser';
  }

  getIcon(): string {
    return 'bar-chart-horizontal';
  }

  protected async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('chrono-analyser-view');
    createDOMStructure(container as HTMLElement);

    this.controller = new AnalysisController(this.app, container as HTMLElement, this.plugin);
    // CORRECTED: Await the async initialize method.
    await this.controller.initialize();
  }

  protected async onClose() {
    this.controller?.destroy();
    this.controller = null;
  }
}

/**
 * Activates the AnalysisView.
 * If the view is already open, it reveals it.
 * If not, it opens it in a new tab.
 * @param app The Obsidian App instance.
 */
export async function activateAnalysisView(app: App): Promise<void> {
  app.workspace.detachLeavesOfType(ANALYSIS_VIEW_TYPE);

  const existingLeaves = app.workspace.getLeavesOfType(ANALYSIS_VIEW_TYPE);
  if (existingLeaves.length > 0) {
    app.workspace.revealLeaf(existingLeaves[0]);
    return;
  }

  const newLeaf = app.workspace.getLeaf('tab');
  await newLeaf.setViewState({
    type: ANALYSIS_VIEW_TYPE,
    active: true
  });
}
