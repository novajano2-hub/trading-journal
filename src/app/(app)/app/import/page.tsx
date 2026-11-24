import { Suspense } from 'react';
import { ImportFlow } from '@/components/app/import/import-flow';

// The app shell's top bar carries the page title.
export default function ImportPage() {
  return (
    <div className="w-full px-5 pt-6 pb-16">
      {/* The step is read from the address bar, so the flow waits inside a Suspense boundary. */}
      <Suspense fallback={null}>
        <ImportFlow />
      </Suspense>
    </div>
  );
}
