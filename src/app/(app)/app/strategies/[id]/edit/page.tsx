import type { Metadata } from 'next';
import { StrategyForm } from '@/components/app/strategies/strategy-form';

export const metadata: Metadata = { title: 'Edit strategy' };

/** Next hands the segment over percent-encoded. */
function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** `params` is a Promise in this Next.js. */
export default async function EditStrategyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StrategyForm strategyId={decoded(id)} />;
}
