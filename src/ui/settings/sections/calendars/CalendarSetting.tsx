/**
 * @file CalendarSetting.tsx
 * @brief React component for displaying and managing a list of configured calendars.
 *
 * @description
 * This file defines the `CalendarSettings` component, which is embedded in the
 * plugin's settings tab. It is responsible for rendering the list of all
 * currently configured calendar sources, allowing the user to modify their
 * colors or delete them. It maintains its own state and syncs with the
 * plugin settings upon saving.
 *
 * @license See LICENSE.md
 */

import { Notice } from 'obsidian';
import * as React from 'react';
import { CalendarInfo } from '../../../../types/calendar_settings';
import FullCalendarPlugin from '../../../../main';
import { t } from '../../../../features/i18n/i18n';

// Define props for the new stable component
interface CalendarSettingRowProps {
  children: React.ReactNode;
  setting: Partial<CalendarInfo>;
  onColorChange: (s: string) => void;
  onNameChange: (s: string) => void;
  deleteCalendar: () => void;
}

// The new stable row component
const CalendarSettingRow = ({
  children,
  setting,
  onColorChange,
  onNameChange,
  deleteCalendar
}: CalendarSettingRowProps) => {
  return (
    <div className="setting-item">
      <button type="button" onClick={deleteCalendar} className="fc-setting-delete-btn">
        ✕
      </button>
      <div className="setting-item-control u-flex-1">
        <input
          type="text"
          value={setting.name || ''}
          className="fc-setting-input"
          onChange={e => onNameChange(e.target.value)}
        />
      </div>
      {children}
      <input
        type="color"
        value={setting.color}
        className="fc-setting-color-input"
        onChange={e => onColorChange(e.target.value)}
      />
    </div>
  );
};

interface CalendarSettingsProps {
  sources: CalendarInfo[];
  submit: (payload: CalendarInfo[]) => void;
  plugin: FullCalendarPlugin;
}

// ✅ Expose this type in `settings.tsx`
export interface CalendarSettingsRef {
  addSource: (source: CalendarInfo) => void;
  getUsedDirectories: () => string[];
}

type CalendarSettingState = {
  sources: CalendarInfo[];
  dirty: boolean;
};

export class CalendarSettings
  extends React.Component<CalendarSettingsProps, CalendarSettingState>
  implements CalendarSettingsRef
{
  constructor(props: CalendarSettingsProps) {
    super(props);
    this.state = { sources: props.sources, dirty: false };
  }

  addSource = (source: CalendarInfo) => {
    this.setState(state => ({
      sources: [...state.sources, source],
      dirty: true
    }));
  };

  getUsedDirectories = () => {
    return this.state.sources
      .map(s => s.type === 'local' && s.directory)
      .filter((s): s is string => !!s);
  };

  updateSourceName = (index: number, name: string) => {
    this.setState(state => {
      const newSources = [...state.sources];
      newSources[index] = { ...newSources[index], name };
      return {
        sources: newSources,
        dirty: true
      };
    });
  };

  render() {
    return (
      <div className="u-w-full">
        {this.state.sources.map((s, idx) => (
          <ProviderAwareCalendarSettingRow
            key={idx}
            setting={s}
            plugin={this.props.plugin}
            onNameChange={(name: string) => this.updateSourceName(idx, name)}
            onColorChange={(color: string) =>
              this.setState(state => ({
                sources: [
                  ...state.sources.slice(0, idx),
                  { ...state.sources[idx], color },
                  ...state.sources.slice(idx + 1)
                ],
                dirty: true
              }))
            }
            deleteCalendar={() =>
              this.setState(state => ({
                sources: [...state.sources.slice(0, idx), ...state.sources.slice(idx + 1)],
                dirty: true
              }))
            }
          />
        ))}
        <div className="setting-item-control">
          {this.state.dirty && (
            <button
              className="mod-cta"
              onClick={() => {
                if (this.state.sources.filter(s => s.type === 'dailynote').length > 1) {
                  new Notice(t('settings.warnings.oneDailyNote'));
                  return;
                }
                this.props.submit(this.state.sources.map(elt => elt));
                this.setState({ dirty: false });
              }}
            >
              Save
            </button>
          )}
        </div>
      </div>
    );
  }
}

// Provider-Aware Calendar Setting Row - the main component
interface ProviderAwareCalendarSettingsRowProps {
  setting: Partial<CalendarInfo>;
  onColorChange: (s: string) => void;
  onNameChange: (s: string) => void;
  deleteCalendar: () => void;
  plugin: FullCalendarPlugin;
}

export const ProviderAwareCalendarSettingRow = ({
  setting,
  onColorChange,
  onNameChange,
  deleteCalendar,
  plugin
}: ProviderAwareCalendarSettingsRowProps) => {
  const registry = plugin.providerRegistry;
  const provider = setting.id ? registry.getInstance(setting.id) : null;

  const rowProps = {
    setting,
    onColorChange,
    onNameChange,
    deleteCalendar
  };

  // All providers should implement the required method - get the provider-specific content
  if (provider) {
    // Defensive check: if provider doesn't have the new method, provide fallback
    if (typeof provider.getSettingsRowComponent !== 'function') {
      console.warn(
        'Full Calendar: Provider instance missing getSettingsRowComponent method. Using fallback display. Please reload the plugin.'
      );

      // Fallback rendering - display basic info about the calendar source
      const displayName = setting.name || setting.type || 'Unknown';
      return (
        <CalendarSettingRow {...rowProps}>
          <div className="setting-item-control">
            <span>{displayName} calendar</span>
          </div>
        </CalendarSettingRow>
      );
    }

    const ProviderContent = provider.getSettingsRowComponent();
    return (
      <CalendarSettingRow {...rowProps}>
        <ProviderContent source={setting} />
      </CalendarSettingRow>
    );
  }

  // Fallback for sources without an ID or provider not found (should not happen in normal operation)
  return (
    <CalendarSettingRow {...rowProps}>
      <div className="setting-item-control">
        <span>Provider not found</span>
      </div>
    </CalendarSettingRow>
  );
};
