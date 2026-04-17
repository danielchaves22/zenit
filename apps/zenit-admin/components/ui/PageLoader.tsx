// frontend/components/ui/PageLoader.tsx
import React from 'react';

interface PageLoaderProps {
  message?: string;
}

export function PageLoader({ message = 'Carregando...' }: PageLoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
      <div className="w-12 h-12 border-4 border-t-accent border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin mb-4"></div> {/* ✅ DINÂMICO */}
      <p className="text-gray-400">{message}</p>
    </div>
  );
}