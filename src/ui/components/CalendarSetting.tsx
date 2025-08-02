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
import { CalendarInfo } from '../../types/calendar_settings';
import { UrlInput } from './forms/UrlInput';
import { TextInput } from './forms/TextInput';
import { UsernameInput } from './forms/UsernameInput';
import { HeadingInput } from './forms/HeadingInput';
import { DirectorySelect } from './forms/DirectorySelect';

interface CalendarSettingsProps {
  sources: CalendarInfo[];
  submit: (payload: CalendarInfo[]) => void;
}

// Expose this type in `settings.tsx`
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
          <CalendarSettingRow
            key={idx}
            setting={s}
            onColorChange={color =>
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

export const CalendarSettingRow = ({
  setting,
  onColorChange,
  deleteCalendar
}: CalendarSettingsRowProps) => {
  const isCalDAV = setting.type === 'caldav';
  return (
    <div className="setting-item">
      <button type="button" onClick={deleteCalendar} className="fc-setting-delete-btn">
        ✕
      </button>

      {/* Primary Display Field */}
      <div className="setting-item-control">
        {setting.type === 'local' && (
          <DirectorySelect
            value={(setting as any).directory}
            onChange={() => {}}
            readOnly={true}
            directories={[]}
          />
        )}
        {setting.type === 'dailynote' && (
          <HeadingInput
            value={(setting as any).heading}
            onChange={() => {}}
            readOnly={true}
            headings={[]}
          />
        )}
        {setting.type === 'google' && (
          <TextInput value={(setting as any).name} onChange={() => {}} readOnly={true} />
        )}
        {(setting.type === 'ical' || setting.type === 'caldav') && (
          <UrlInput value={(setting as any).url} onChange={() => {}} readOnly={true} />
        )}
      </div>

      {/* Additional Fields for CalDAV */}
      {isCalDAV && (
        <div className="setting-item-control">
          <TextInput value={(setting as any).name} onChange={() => {}} readOnly={true} />
        </div>
      )}
      {isCalDAV && (
        <div className="setting-item-control">
          <UsernameInput value={(setting as any).username} onChange={() => {}} readOnly={true} />
        </div>
      )}

      {/* Color Picker */}
      <input
        type="color"
        value={setting.color}
        className="fc-setting-color-input"
        onChange={e => onColorChange(e.target.value)}
      />
    </div>
  );
};
