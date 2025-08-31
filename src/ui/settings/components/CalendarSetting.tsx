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
import { CalendarInfo } from '../../../types';
import FullCalendarPlugin from '../../../main';

interface BasicProps<T extends Partial<CalendarInfo>> {
  source: T;
}

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

  render() {
    return (
      <div style={{ width: '100%' }}>
        {this.state.sources.map((s, idx) => (
          <ProviderAwareCalendarSettingRow
            key={idx}
            setting={s}
            plugin={this.props.plugin}
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
                  new Notice('Only one daily note is allowed.');
                  return;
                }
                this.props.submit(this.state.sources.map(elt => elt as CalendarInfo));
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

interface CalendarSettingsRowProps {
  setting: Partial<CalendarInfo>;
  onColorChange: (s: string) => void;
  deleteCalendar: () => void;
}

// Provider-Aware Calendar Setting Row - the main component
interface ProviderAwareCalendarSettingsRowProps {
  setting: Partial<CalendarInfo>;
  onColorChange: (s: string) => void;
  deleteCalendar: () => void;
  plugin: FullCalendarPlugin;
}

export const ProviderAwareCalendarSettingRow = ({
  setting,
  onColorChange,
  deleteCalendar,
  plugin
}: ProviderAwareCalendarSettingsRowProps) => {
  const registry = plugin.providerRegistry;
  const provider = setting.id ? registry.getInstance(setting.id) : null;

  // Chrome: Common parts for all calendar sources
  const ChromeWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="setting-item">
      <button type="button" onClick={deleteCalendar} className="fc-setting-delete-btn">
        ✕
      </button>
      {children}
      <input
        type="color"
        value={setting.color}
        className="fc-setting-color-input"
        onChange={e => onColorChange(e.target.value)}
      />
    </div>
  );

  // All providers should implement the required method - get the provider-specific content
  if (provider) {
    // Defensive check: if provider doesn't have the new method, provide fallback
    if (typeof provider.getSettingsRowComponent !== 'function') {
      console.warn(
        'Full Calendar: Provider instance missing getSettingsRowComponent method. Using fallback display. Please reload the plugin.'
      );

      // Fallback rendering - display basic info about the calendar source
      const displayName = (setting as any).name || setting.type || 'Unknown';
      return (
        <ChromeWrapper>
          <div className="setting-item-control">
            <span>{displayName} calendar</span>
          </div>
        </ChromeWrapper>
      );
    }

    const ProviderContent = provider.getSettingsRowComponent();
    return (
      <ChromeWrapper>
        <ProviderContent source={setting} />
      </ChromeWrapper>
    );
  }

  // Fallback for sources without an ID or provider not found (should not happen in normal operation)
  return (
    <ChromeWrapper>
      <div className="setting-item-control">
        <span>Provider not found</span>
      </div>
    </ChromeWrapper>
  );
};
