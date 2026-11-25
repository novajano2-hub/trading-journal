import type { Metadata } from 'next';
import { SurveyStep } from '@/components/app/welcome/survey-step';

export const metadata: Metadata = {
  title: 'About your trading',
  robots: { index: false },
};

export default async function SurveyPage({
  params,
}: PageProps<'/app/welcome/[step]'>) {
  const { step } = await params;
  return <SurveyStep step={step} />;
}
