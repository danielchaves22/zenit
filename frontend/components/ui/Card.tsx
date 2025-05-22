// frontend/components/ui/Card.tsx
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  headerTitle?: string;
  headerSubtitle?: string;
}

export function Card({ children, className = '', headerTitle, headerSubtitle }: CardProps) {
  return (
    <div className={`bg-[#151921] shadow-md rounded-xl overflow-hidden border border-gray-700 ${className}`}>
      {(headerTitle || headerSubtitle) && (
        <div className="bg-[#151921] px-6 py-4 border-b border-gray-700">
          {headerTitle && <h2 className="text-lg font-medium text-white">{headerTitle}</h2>}
          {headerSubtitle && <p className="text-sm text-gray-400">{headerSubtitle}</p>}
        </div>
      )}
      <div className={!className?.includes('p-0') ? 'p-6' : ''}>
        {children}
      </div>
    </div>
  );
}