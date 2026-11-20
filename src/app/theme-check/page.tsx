import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export const metadata: Metadata = { robots: { index: false } };

// Fixture for e2e/theme.spec.ts. Remove with the old components in Task 7
// once real pages carry the primary button and the toggle.
export default function ThemeCheck() {
  return (
    <main className="flex items-center gap-4 p-8">
      <Button data-testid="primary-button">Import trades</Button>
      <ThemeToggle />
    </main>
  );
}
