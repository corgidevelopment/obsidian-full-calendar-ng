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
import { UsernameInput } from './forms/UsernameInput';
import { PasswordInput } from './forms/PasswordInput';
import { HeadingInput } from './forms/HeadingInput';
import { TextInput } from './forms/TextInput';
import { DirectorySelect } from './forms/DirectorySelect';

interface CalendarSettingsProps {
  sources: CalendarInfo[];
  submit: (payload: CalendarInfo[]) => void;
}

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
      .map(s => {
        if (s.type === 'local') {
          // Local sources always have a directory property (flat or nested)
          const flat = (s as { directory?: unknown }).directory;
          const nested = (s as { config?: { directory?: unknown } }).config?.directory;
          return typeof flat === 'string' ? flat : typeof nested === 'string' ? nested : null;
        }
        return null;
      })
      .filter((p): p is string => typeof p === 'string' && !!p);
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
  const source = setting as CalendarInfo & { config?: Record<string, unknown> };
  const config = source.config || {};
  const isCalDAV = source.type === 'caldav';

  // Helper to get a property from either the flat object or the nested config
  const getProp = (key: string): unknown =>
    (source as Record<string, unknown>)[key] ?? config[key as keyof typeof config];

  return (
    <div className="setting-item">
      <button type="button" onClick={deleteCalendar} className="fc-setting-delete-btn">
        ✕
      </button>

      {source.type === 'local' && (
        <DirectorySelect
          value={(getProp('directory') as string) || ''}
          onChange={() => {}}
          directories={[]}
          readOnly
        />
      )}
      {source.type === 'dailynote' && (
        <HeadingInput
          value={(getProp('heading') as string) || ''}
          onChange={() => {}}
          headings={[]}
          readOnly
        />
      )}
      {(source.type === 'ical' || source.type === 'caldav') && (
        <UrlInput value={(getProp('url') as string) || ''} onChange={() => {}} readOnly />
      )}
      {source.type === 'google' && (
        <TextInput value={(getProp('name') as string) || ''} onChange={() => {}} readOnly />
      )}

      {isCalDAV && (
        <TextInput value={(getProp('name') as string) || ''} onChange={() => {}} readOnly />
      )}
      {isCalDAV && (
        <UsernameInput value={(getProp('username') as string) || ''} onChange={() => {}} readOnly />
      )}

      <input
        type="color"
        value={source.color}
        className="fc-setting-color-input"
        onChange={e => onColorChange(e.target.value)}
      />
    </div>
  );
};
