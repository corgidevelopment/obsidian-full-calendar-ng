// src/ui/components/forms/UsernameInput.tsx

import * as React from 'react';
import { CalendarInfo } from '../../../types';
import { BasicProps, SourceWith } from './common';

export function UsernameInput<T extends Partial<CalendarInfo>>({
  source,
  changeListener
}: BasicProps<T>) {
  let sourceWithUsername = source as SourceWith<T, { username: undefined }>;
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Username</div>
        <div className="setting-item-description">Username for the account</div>
      </div>
      <div className="setting-item-control">
        <input
          required
          type="text"
          value={sourceWithUsername.username || ''}
          onChange={changeListener(x => ({
            ...sourceWithUsername,
            username: x
          }))}
        />
      </div>
    </div>
  );
}
