// src/ui/components/forms/UrlInput.tsx

import { CalendarInfo } from '../../../types';
import { BasicProps, SourceWith } from './common';

export function UrlInput<T extends Partial<CalendarInfo>>({
  source,
  changeListener
}: BasicProps<T>) {
  let sourceWithUrl = source as SourceWith<T, { url: undefined }>;
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Url</div>
        <div className="setting-item-description">Url of the server</div>
      </div>
      <div className="setting-item-control">
        <input
          required
          type="text"
          value={sourceWithUrl.url || ''}
          onChange={changeListener(x => ({
            ...sourceWithUrl,
            url: x
          }))}
        />
      </div>
    </div>
  );
}
