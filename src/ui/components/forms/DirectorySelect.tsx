// src/ui/components/forms/DirectorySelect.tsx

import { CalendarInfo } from '../../../types';
import { BasicProps, SourceWith } from './common';

interface DirectorySelectProps<T extends Partial<CalendarInfo>> extends BasicProps<T> {
  directories: string[];
}

export function DirectorySelect<T extends Partial<CalendarInfo>>({
  source,
  changeListener,
  directories
}: DirectorySelectProps<T>) {
  const dirOptions = [...directories];
  dirOptions.sort();

  let sourceWithDirectory = source as SourceWith<T, { directory: undefined }>;
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Directory</div>
        <div className="setting-item-description">Directory to store events</div>
      </div>
      <div className="setting-item-control">
        <select
          required
          value={sourceWithDirectory.directory || ''}
          onChange={changeListener(x => ({
            ...sourceWithDirectory,
            directory: x
          }))}
        >
          <option value="" disabled hidden>
            Choose a directory
          </option>
          {dirOptions.map((o, idx) => (
            <option key={idx} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
