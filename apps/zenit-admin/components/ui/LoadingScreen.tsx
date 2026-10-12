// frontend/components/ui/LoadingScreen.tsx
import React from 'react';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Carregando...' }: LoadingScreenProps) {
  return (
    <div role="status" className="fixed inset-0 bg-background flex flex-col items-center justify-center z-50">
      <div className="mb-6">
        <div className="text-xl font-semibold text-text">Zenit Admin</div>
      </div>

      <div className="w-16 h-16 border-4 border-t-accent border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin mb-4"></div> {/* ✅ DINÂMICO */}

      <p className="text-text text-lg font-medium">{message}</p>
    </div>
  );
}
