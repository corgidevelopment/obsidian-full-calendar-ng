import React, { useEffect, useState } from 'react';
import { PasswordInput } from '../components/forms/PasswordInput';
import { UsernameInput } from '../components/forms/UsernameInput';
import { DirectorySelect } from '../components/forms/DirectorySelect';
import { HeadingInput } from '../components/forms/HeadingInput';
import { CalendarInfo } from '../../types/calendar_settings';

interface AddCalendarProps {
  source: Partial<CalendarInfo>;
  directories: string[];
  headings: string[];
  submit: (source: CalendarInfo) => Promise<void>;
}

export const AddCalendarSource = ({ source, directories, headings, submit }: AddCalendarProps) => {
  const [setting, setSettingState] = useState(source);

  useEffect(() => {
    setSettingState(source);
  }, [source]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(setting as CalendarInfo);
  };

  const isCalDAV = source.type === 'caldav';

  return (
    <div className="vertical-tab-content">
      <form onSubmit={handleSubmit}>
        {source.type === 'local' && (
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">Directory</div>
              <div className="setting-item-description">Directory to store events</div>
            </div>
            <div className="setting-item-control">
              <DirectorySelect
                value={(setting as { directory?: string }).directory || ''}
                onChange={value => setSettingState({ ...setting, directory: value })}
                directories={directories}
              />
            </div>
          </div>
        )}
        {source.type === 'dailynote' && (
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">Heading</div>
              <div className="setting-item-description">
                Heading to store events under in the daily note.
              </div>
            </div>
            <div className="setting-item-control">
              <HeadingInput
                value={(setting as { heading?: string }).heading || ''}
                onChange={value => setSettingState({ ...setting, heading: value })}
                headings={headings}
              />
            </div>
          </div>
        )}
        {isCalDAV && (
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">Username</div>
              <div className="setting-item-description">Username for the account</div>
            </div>
            <div className="setting-item-control">
              <UsernameInput
                value={(setting as { username?: string }).username || ''}
                onChange={value => setSettingState({ ...setting, username: value })}
              />
            </div>
          </div>
        )}
        {isCalDAV && (
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">Password</div>
              <div className="setting-item-description">Password for the account</div>
            </div>
            <div className="setting-item-control">
              <PasswordInput
                value={(setting as { password?: string }).password || ''}
                onChange={value => setSettingState({ ...setting, password: value })}
              />
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
