/**
 * Integration tests for workspace settings composition
 */

import { WorkspaceSettings, FullCalendarSettings, DEFAULT_SETTINGS } from '../../types/settings';

// Mock WorkspaceManager functionality to test composition logic
class MockWorkspaceManager {
  private settings: FullCalendarSettings;

  constructor(settings: FullCalendarSettings) {
    this.settings = settings;
  }

  public getActiveWorkspace(): WorkspaceSettings | null {
    if (!this.settings.activeWorkspace) return null;
    return this.settings.workspaces.find(w => w.id === this.settings.activeWorkspace) || null;
  }

  public getCalendarConfig(): Partial<FullCalendarSettings> {
    const workspace = this.getActiveWorkspace();
    if (!workspace) return this.settings;

    const workspaceSettings = { ...this.settings };

    // Apply view overrides
    if (workspace.defaultView?.desktop || workspace.defaultView?.mobile) {
      workspaceSettings.initialView = {
        desktop: workspace.defaultView.desktop || this.settings.initialView?.desktop,
        mobile: workspace.defaultView.mobile || this.settings.initialView?.mobile
      };
    }

    // Apply business hours override
    if (workspace.businessHours !== undefined) {
      workspaceSettings.businessHours = workspace.businessHours;
    }

    // Apply new granular view configuration overrides
    if (workspace.slotMinTime !== undefined) {
      workspaceSettings.slotMinTime = workspace.slotMinTime;
    }

    if (workspace.slotMaxTime !== undefined) {
      workspaceSettings.slotMaxTime = workspace.slotMaxTime;
    }

    if (workspace.weekends !== undefined) {
      workspaceSettings.weekends = workspace.weekends;
    }

    if (workspace.hiddenDays !== undefined) {
      workspaceSettings.hiddenDays = workspace.hiddenDays;
    }

    if (workspace.dayMaxEvents !== undefined) {
      workspaceSettings.dayMaxEvents = workspace.dayMaxEvents;
    }

    return workspaceSettings;
  }
}

describe('Workspace settings composition (integration)', () => {
  test('should return global settings when no workspace is active', () => {
    const settings: FullCalendarSettings = {
      ...DEFAULT_SETTINGS,
      slotMinTime: '06:00',
      slotMaxTime: '22:00',
      weekends: false,
      hiddenDays: [0],
      dayMaxEvents: 5,
      workspaces: [],
      activeWorkspace: null
    };

    const manager = new MockWorkspaceManager(settings);
    const config = manager.getCalendarConfig();

    expect(config.slotMinTime).toBe('06:00');
    expect(config.slotMaxTime).toBe('22:00');
    expect(config.weekends).toBe(false);
    expect(config.hiddenDays).toEqual([0]);
    expect(config.dayMaxEvents).toBe(5);
  });

  test('should apply workspace overrides to global settings', () => {
    const workspace: WorkspaceSettings = {
      id: 'test_workspace',
      name: 'Test Workspace',
      slotMinTime: '09:00',
      slotMaxTime: '17:00',
      weekends: true,
      hiddenDays: [0, 6],
      dayMaxEvents: 3
    };

    const settings: FullCalendarSettings = {
      ...DEFAULT_SETTINGS,
      slotMinTime: '06:00',
      slotMaxTime: '22:00',
      weekends: false,
      hiddenDays: [],
      dayMaxEvents: false,
      workspaces: [workspace],
      activeWorkspace: workspace.id
    };

    const manager = new MockWorkspaceManager(settings);
    const config = manager.getCalendarConfig();

    // Should use workspace overrides
    expect(config.slotMinTime).toBe('09:00');
    expect(config.slotMaxTime).toBe('17:00');
    expect(config.weekends).toBe(true);
    expect(config.hiddenDays).toEqual([0, 6]);
    expect(config.dayMaxEvents).toBe(3);
  });

  test('should fall back to global settings for undefined workspace properties', () => {
    const workspace: WorkspaceSettings = {
      id: 'test_workspace',
      name: 'Test Workspace',
      slotMinTime: '09:00'
      // slotMaxTime, weekends, hiddenDays, dayMaxEvents not defined
    };

    const settings: FullCalendarSettings = {
      ...DEFAULT_SETTINGS,
      slotMinTime: '06:00',
      slotMaxTime: '22:00',
      weekends: false,
      hiddenDays: [0],
      dayMaxEvents: 10,
      workspaces: [workspace],
      activeWorkspace: workspace.id
    };

    const manager = new MockWorkspaceManager(settings);
    const config = manager.getCalendarConfig();

    // Should use workspace override for slotMinTime
    expect(config.slotMinTime).toBe('09:00');
    // Should fall back to global settings for others
    expect(config.slotMaxTime).toBe('22:00');
    expect(config.weekends).toBe(false);
    expect(config.hiddenDays).toEqual([0]);
    expect(config.dayMaxEvents).toBe(10);
  });

  test('should handle workspace with mixed overrides and defaults', () => {
    const workspace: WorkspaceSettings = {
      id: 'mixed_workspace',
      name: 'Mixed Workspace',
      weekends: false,
      dayMaxEvents: true // No limit
      // slotMinTime, slotMaxTime, hiddenDays not defined
    };

    const settings: FullCalendarSettings = {
      ...DEFAULT_SETTINGS,
      slotMinTime: '08:00',
      slotMaxTime: '20:00',
      weekends: true,
      hiddenDays: [1, 2],
      dayMaxEvents: 2,
      workspaces: [workspace],
      activeWorkspace: workspace.id
    };

    const manager = new MockWorkspaceManager(settings);
    const config = manager.getCalendarConfig();

    // Should use workspace overrides where defined
    expect(config.weekends).toBe(false);
    expect(config.dayMaxEvents).toBe(true);

    // Should fall back to global settings for others
    expect(config.slotMinTime).toBe('08:00');
    expect(config.slotMaxTime).toBe('20:00');
    expect(config.hiddenDays).toEqual([1, 2]);
  });

  test('should handle complex schedule workspace (business scenario)', () => {
    const workWorkspace: WorkspaceSettings = {
      id: 'work_focused',
      name: 'Work Focus',
      slotMinTime: '08:00',
      slotMaxTime: '18:00',
      weekends: false,
      hiddenDays: [0, 6], // Hide both weekend days
      dayMaxEvents: 4,
      businessHours: {
        enabled: true,
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '17:00'
      }
    };

    const settings: FullCalendarSettings = {
      ...DEFAULT_SETTINGS,
      slotMinTime: '00:00',
      slotMaxTime: '24:00',
      weekends: true,
      hiddenDays: [],
      dayMaxEvents: false,
      businessHours: {
        enabled: false,
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '17:00'
      },
      workspaces: [workWorkspace],
      activeWorkspace: workWorkspace.id
    };

    const manager = new MockWorkspaceManager(settings);
    const config = manager.getCalendarConfig();

    // Workspace should completely override global settings for focused work view
    expect(config.slotMinTime).toBe('08:00');
    expect(config.slotMaxTime).toBe('18:00');
    expect(config.weekends).toBe(false);
    expect(config.hiddenDays).toEqual([0, 6]);
    expect(config.dayMaxEvents).toBe(4);
    expect(config.businessHours?.enabled).toBe(true);
  });
});
