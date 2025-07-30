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
import { CalendarInfo } from '../../types';

type SourceWith<T extends Partial<CalendarInfo>, K> = T extends K ? T : never;

interface BasicProps<T extends Partial<CalendarInfo>> {
  source: T;
}

function DirectorySetting<T extends Partial<CalendarInfo>>({ source }: BasicProps<T>) {
  let sourceWithDirectory = source as SourceWith<T, { directory: undefined }>;
  return (
    <div className="setting-item-control">
      <input
        disabled
        type="text"
        value={sourceWithDirectory.directory}
        className="fc-setting-input"
      />
    </div>
  );
}

function HeadingSetting<T extends Partial<CalendarInfo>>({ source }: BasicProps<T>) {
  let sourceWithHeading = source as SourceWith<T, { heading: undefined }>;
  return (
    <div className="setting-item-control fc-heading-setting-control">
      <span>Under heading</span>
      <input
        disabled
        type="text"
        value={sourceWithHeading.heading}
        className="fc-setting-input is-inline"
      />
      <span className="fc-heading-setting-suffix">in daily notes</span>
    </div>
  );
}

function UrlSetting<T extends Partial<CalendarInfo>>({ source }: BasicProps<T>) {
  let sourceWithUrl = source as SourceWith<T, { url: undefined }>;
  return (
    <div className="setting-item-control">
      <input disabled type="text" value={sourceWithUrl.url} className="fc-setting-input" />
    </div>
  );
}

function NameSetting<T extends Partial<CalendarInfo>>({ source }: BasicProps<T>) {
  let sourceWithName = source as SourceWith<T, { name: undefined }>;
  return (
    <div className="setting-item-control">
      <input disabled type="text" value={sourceWithName.name} className="fc-setting-input" />
    </div>
  );
}

function Username<T extends Partial<CalendarInfo>>({ source }: BasicProps<T>) {
  let sourceWithUsername = source as SourceWith<T, { username: undefined }>;
  return (
    <div className="setting-item-control">
      <input
        disabled
        type="text"
        value={sourceWithUsername.username}
        className="fc-setting-input"
      />
    </div>
  );
}

interface CalendarSettingsProps {
  sources: CalendarInfo[];
  submit: (payload: CalendarInfo[]) => void;
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
      {setting.type === 'local' ? (
        <DirectorySetting source={setting} />
      ) : setting.type === 'dailynote' ? (
        <HeadingSetting source={setting} />
      ) : (
        <UrlSetting source={setting} />
      )}
      {isCalDAV && <NameSetting source={setting} />}
      {isCalDAV && <Username source={setting} />}
      <input
        type="color"
        value={setting.color}
        className="fc-setting-color-input"
        onChange={e => onColorChange(e.target.value)}
      />
    </div>
  );
};
