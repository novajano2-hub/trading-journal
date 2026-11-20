import type { Metadata } from 'next';
import { Barlow, Big_Shoulders, DotGothic16 } from 'next/font/google';
import './globals.css';

// Variable, with the optical-size axis, so globals.css can pin the Display cut
// (Google's static weights default to opsz 14, the wider Text cut).
const display = Big_Shoulders({
  variable: '--nf-display',
  subsets: ['latin'],
  axes: ['opsz'],
});

const text = Barlow({
  variable: '--nf-text',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const stamp = DotGothic16({
  variable: '--nf-stamp',
  subsets: ['latin'],
  weight: '400',
});

export const metadata: Metadata = {
  title: { default: 'Keel', template: '%s · Keel' },
  description: 'Trading journal',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${text.variable} ${stamp.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
