/**
 * @file AddCalendarSource.tsx
 * @brief React component for the "Add New Calendar" modal form.
 *
 * @description
 * This file defines the `AddCalendarSource` React component. It renders a
 * dynamic form tailored to the type of calendar being added (e.g., showing
 * a directory dropdown for local calendars, or URL/credential fields for
 * CalDAV). It manages form state and handles submission.
 *
 * @license See LICENSE.md
 */

import * as React from 'react';
import { useState } from 'react';
import { CalendarInfo } from '../../types';
import { ColorPicker } from './forms/ColorPicker';
import { DirectorySelect } from './forms/DirectorySelect';
import { HeadingInput } from './forms/HeadingInput';
import { PasswordInput } from './forms/PasswordInput';
import { UrlInput } from './forms/UrlInput';
import { UsernameInput } from './forms/UsernameInput';

interface AddCalendarProps {
  source: Partial<CalendarInfo>;
  directories: string[];
  headings: string[];
  submit: (source: CalendarInfo) => Promise<void>;
}

export const AddCalendarSource = ({ source, directories, headings, submit }: AddCalendarProps) => {
  const isCalDAV = source.type === 'caldav';

  const [setting, setSettingState] = useState(source);
  const [submitting, setSubmitingState] = useState(false);
  const [submitText, setSubmitText] = useState(isCalDAV ? 'Import Calendars' : 'Add Calendar');

  function makeChangeListener<T extends Partial<CalendarInfo>>(
    fromString: (val: string) => T
  ): React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement> {
    return e => setSettingState(fromString(e.target.value));
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!submitting) {
      setSubmitingState(true);
      setSubmitText(isCalDAV ? 'Importing Calendars' : 'Adding Calendar');
      await submit(setting as CalendarInfo);
    }
  };

  return (
    <div className="vertical-tab-content">
      <form onSubmit={handleSubmit}>
        {!isCalDAV && (
          // CalDAV can import multiple calendars. Instead of picking
          // a single color to be used for all calendars, default to the
          // colors reported from the server. Users can change that later
          // if they wish.
          <ColorPicker source={setting} changeListener={makeChangeListener} />
        )}
        {source.type === 'local' && (
          <DirectorySelect
            source={setting}
            changeListener={makeChangeListener}
            directories={directories}
          />
        )}
        {source.type === 'dailynote' && (
          <HeadingInput source={setting} changeListener={makeChangeListener} headings={headings} />
        )}
        {source.type === 'ical' || source.type === 'caldav' ? (
          <UrlInput source={setting} changeListener={makeChangeListener} />
        ) : null}
        {isCalDAV && <UsernameInput source={setting} changeListener={makeChangeListener} />}
        {isCalDAV && <PasswordInput source={setting} changeListener={makeChangeListener} />}
        <div className="setting-item">
          <div className="setting-item-info" />
          <div className="setting-control">
            <button className="mod-cta" type="submit" disabled={submitting}>
              {submitText}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
