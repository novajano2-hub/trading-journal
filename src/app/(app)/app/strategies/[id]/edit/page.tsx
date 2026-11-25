import type { Metadata } from 'next';
import { StrategyForm } from '@/components/app/strategies/strategy-form';
import { decodedSegment } from '@/lib/route-param';

export const metadata: Metadata = { title: 'Edit strategy' };

/** `params` is a Promise in this Next.js. */
export default async function EditStrategyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StrategyForm strategyId={decodedSegment(id)} />;
}
