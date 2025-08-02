// src/ui/components/forms/PasswordInput.tsx

import { CalendarInfo } from '../../../types';
import { BasicProps, SourceWith } from './common';

export function PasswordInput<T extends Partial<CalendarInfo>>({
  source,
  changeListener
}: BasicProps<T>) {
  let sourceWithPassword = source as SourceWith<T, { password: undefined }>;
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Password</div>
        <div className="setting-item-description">Password for the account</div>
      </div>
      <div className="setting-item-control">
        <input
          required
          type="password"
          value={sourceWithPassword.password || ''}
          onChange={changeListener(x => ({
            ...sourceWithPassword,
            password: x
          }))}
        />
      </div>
    </div>
  );
}
