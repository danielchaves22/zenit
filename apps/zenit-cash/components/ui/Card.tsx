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
    <div className={`bg-surface text-text rounded-xl overflow-hidden border border-border ${className}`}>
      {(headerTitle || headerSubtitle) && (
        <div className="bg-surface px-6 py-4 border-b border-border">
          {headerTitle && <h2 className="text-lg font-medium text-text">{headerTitle}</h2>}
          {headerSubtitle && <p className="text-sm text-text-muted">{headerSubtitle}</p>}
        </div>
      )}
      <div className={!className?.includes('p-0') ? 'p-6' : ''}>
        {children}
      </div>
    </div>
  );
}