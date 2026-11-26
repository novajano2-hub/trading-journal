'use client';

import { CalendarSheetButton, TradesMiniCalendar } from './mini-calendar';
import { DayNoteAction } from './day-note-dialog';
import { TradesDayView } from './day-view';
import { TradesWeekView } from './week-view';

/*
 * The two views as the pages mount them: the mini calendar in the right
 * column (behind a Calendar button where there is no column) and, on the Day
 * view, the note action on each card. The pages are static server components,
 * so the functions the views take live here. Render inside `<Suspense>`.
 */

export function TradesDayPageView(): React.JSX.Element {
  return (
    <TradesDayView
      aside={<TradesMiniCalendar />}
      calendarAction={<CalendarSheetButton />}
      noteAction={(date) => <DayNoteAction date={date} />}
    />
  );
}

export function TradesWeekPageView(): React.JSX.Element {
  return (
    <TradesWeekView
      aside={<TradesMiniCalendar />}
      calendarAction={<CalendarSheetButton />}
    />
  );
}
