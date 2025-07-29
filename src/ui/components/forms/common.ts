// src/ui/components/forms/common.ts

import * as React from 'react';
import { CalendarInfo } from '../../../types';

export type ChangeListener = <T extends Partial<CalendarInfo>>(
  fromString: (val: string) => T
) => React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement>;

export type SourceWith<T extends Partial<CalendarInfo>, K> = T extends K ? T : never;

export interface BasicProps<T extends Partial<CalendarInfo>> {
  source: T;
  changeListener: ChangeListener;
}
