import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Import',
  robots: { index: false },
};

export default function ImportLayout({ children }: LayoutProps<'/app/import'>) {
  return children;
}
