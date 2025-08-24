/**
 * Basic tests for workspace functionality
 */

import {
  WorkspaceSettings,
  createDefaultWorkspace,
  generateWorkspaceId,
  getActiveWorkspace,
  FullCalendarSettings,
  DEFAULT_SETTINGS
} from '../../types/settings';

describe('Workspace functionality', () => {
  test('should create a default workspace', () => {
    const workspace = createDefaultWorkspace('Test Workspace');

    expect(workspace.name).toBe('Test Workspace');
    expect(workspace.id).toBeDefined();
    expect(workspace.id.startsWith('workspace_')).toBe(true);
    expect(workspace.defaultView).toBeUndefined();
    expect(workspace.visibleCalendars).toBeUndefined();
  });

  test('should generate unique workspace IDs', () => {
    const id1 = generateWorkspaceId();
    const id2 = generateWorkspaceId();

    expect(id1).not.toBe(id2);
    expect(id1.startsWith('workspace_')).toBe(true);
    expect(id2.startsWith('workspace_')).toBe(true);
  });

  test('should get active workspace', () => {
    const workspace1 = createDefaultWorkspace('Workspace 1');
    const workspace2 = createDefaultWorkspace('Workspace 2');

    const settings: FullCalendarSettings = {
      ...DEFAULT_SETTINGS,
      workspaces: [workspace1, workspace2],
      activeWorkspace: workspace2.id
    };

    const activeWorkspace = getActiveWorkspace(settings);
    expect(activeWorkspace).toBe(workspace2);
  });

  test('should return null for no active workspace', () => {
    const settings: FullCalendarSettings = {
      ...DEFAULT_SETTINGS,
      workspaces: [],
      activeWorkspace: null
    };

    const activeWorkspace = getActiveWorkspace(settings);
    expect(activeWorkspace).toBeNull();
  });

  test('should return null for invalid active workspace ID', () => {
    const workspace = createDefaultWorkspace('Test Workspace');
    const settings: FullCalendarSettings = {
      ...DEFAULT_SETTINGS,
      workspaces: [workspace],
      activeWorkspace: 'invalid_id'
    };

    const activeWorkspace = getActiveWorkspace(settings);
    expect(activeWorkspace).toBeNull();
  });

  test('should configure workspace with all options', () => {
    const workspace: WorkspaceSettings = {
      id: generateWorkspaceId(),
      name: 'Full Workspace',
      defaultView: {
        desktop: 'timeGridWeek',
        mobile: 'timeGridDay'
      },
      defaultDate: 'today',
      visibleCalendars: ['cal1', 'cal2'],
      categoryFilter: {
        mode: 'show-only',
        categories: ['Work', 'Important']
      },
      businessHours: {
        enabled: true,
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '17:00'
      },
      timelineExpanded: false
    };

    expect(workspace.name).toBe('Full Workspace');
    expect(workspace.defaultView?.desktop).toBe('timeGridWeek');
    expect(workspace.visibleCalendars).toContain('cal1');
    expect(workspace.categoryFilter?.mode).toBe('show-only');
    expect(workspace.businessHours?.enabled).toBe(true);
  });
});
