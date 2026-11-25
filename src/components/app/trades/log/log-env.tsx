'use client';

import { createContext, useContext } from 'react';
import type { ColumnId } from '@/data/trade-columns';
import type { DayRecord } from '@/domain/types';
import type { CellEnv } from '../columns';

/** What a day card needs from the view around it: the table's cell environment and columns, the day records and today. */
export interface LogEnv {
  env: CellEnv;
  columns: readonly ColumnId[];
  /** The Day view's columns, for a day opened from the Week view's tile (its table has no Day column). */
  dayColumns?: readonly ColumnId[];
  /** The day record by date (moods, finished days). */
  records: ReadonlyMap<string, DayRecord>;
}

export const LogEnvContext = createContext<LogEnv | null>(null);

export function useLogEnv(): LogEnv {
  const value = useContext(LogEnvContext);
  if (!value)
    throw new Error('The trade log needs a LogEnvContext.Provider above it');
  return value;
}
