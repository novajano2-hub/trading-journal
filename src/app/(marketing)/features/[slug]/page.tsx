import { notFound } from 'next/navigation';
import { MODULES } from '@/content/modules';

// Placeholder until the module pages land in Task 7.
export function generateStaticParams() {
  return MODULES.filter((m) => m.hasPage).map((m) => ({ slug: m.slug }));
}

export default async function FeaturePage({
  params,
}: PageProps<'/features/[slug]'>) {
  const { slug } = await params;
  const info = MODULES.find((m) => m.slug === slug && m.hasPage);
  if (!info) notFound();
  return (
    <main className="px-4 py-10 md:px-14">
      <h1 className="font-display text-[clamp(3rem,9vw,6rem)] leading-[0.9] font-black uppercase">
        {info.name}
      </h1>
    </main>
  );
}
