'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '../../components/layout/AppShell';

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const path = searchParams.get('path') || 'C:\\AIMACT';

  return <AppShell workspace={path} />;
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-500">
        Loading...
      </div>
    }>
      <WorkspaceContent />
    </Suspense>
  );
}
