import type { Metadata } from 'next';
import { CalendarPage } from '@/components/app/calendar/calendar-view';

export const metadata: Metadata = { title: 'Calendar' };

/** Static: the skeleton prerenders, and the view fills in on the client once it reads the URL. */
export default function Page() {
  return <CalendarPage />;
}
