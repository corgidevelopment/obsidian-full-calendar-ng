// src/ui/components/forms/HeadingInput.tsx

import * as React from 'react';
import { CalendarInfo } from '../../../types';
import { BasicProps, SourceWith } from './common';

export function HeadingInput<T extends Partial<CalendarInfo>>({
  source,
  changeListener,
  headings
}: BasicProps<T> & { headings: string[] }) {
  let sourceWithHeading = source as SourceWith<T, { heading: undefined }>;
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Heading</div>
        <div className="setting-item-description">
          Heading to store events under in the daily note.
        </div>
      </div>
      <div className="setting-item-control">
        {headings.length > 0 ? (
          <select
            required
            value={sourceWithHeading.heading || ''}
            onChange={changeListener(x => ({
              ...sourceWithHeading,
              heading: x
            }))}
          >
            <option value="" disabled hidden>
              Choose a heading
            </option>
            {headings.map((o, idx) => (
              <option key={idx} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            required
            type="text"
            value={sourceWithHeading.heading || ''}
            onChange={changeListener(x => ({
              ...sourceWithHeading,
              heading: x
            }))}
          />
        )}
      </div>
    </div>
  );
}
