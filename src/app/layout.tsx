import type { Metadata } from 'next';
import { Instrument_Sans } from 'next/font/google';
import { APPEARANCE_SCRIPT } from '@/lib/appearance';
import './globals.css';

// Keel's one family, numbers set in its tabular figures (theme.css maps
// both font-sans and font-mono to it).
const sans = Instrument_Sans({
  variable: '--font-keel',
  subsets: ['latin'],
  axes: ['wdth'],
});

export const metadata: Metadata = {
  title: { default: 'Keel', template: '%s · Keel' },
  description: 'Trading journal',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Before first paint, so a dark choice never flashes light. */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
