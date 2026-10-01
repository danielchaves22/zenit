// frontend/components/ui/LoadingScreen.tsx
import React from 'react';
import { Wallet } from 'lucide-react';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Carregando...' }: LoadingScreenProps) {
  return (
    <div className="fixed inset-0 bg-elevated flex flex-col items-center justify-center z-50">
      <div className="mb-6">
        <Wallet className="mx-auto text-accent" size={36} aria-hidden="true" />
        <div className="text-xl font-bold text-text mt-2">Zenit</div>
      </div>
      
      <div className="w-16 h-16 border-4 border-t-accent border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin mb-4"></div> {/* ✅ DINÂMICO */}
      
      <p className="text-text text-lg font-medium">{message}</p>
    </div>
  );
}