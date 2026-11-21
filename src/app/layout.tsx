import type { Metadata } from 'next';
import { Instrument_Sans } from 'next/font/google';
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

// Runs before first paint so a saved dark choice never flashes light.
const themeInit = `try{if(localStorage.getItem('keel-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
