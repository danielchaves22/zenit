import { ReactNode } from 'react';
interface CardProps {
  children: ReactNode;
  className?: string;
  headerTitle?: string;
  headerSubtitle?: string;
}
export function Card({ children, className = '', headerTitle, headerSubtitle }: CardProps) {
  return (
    <div className={`admin-card ${className}`}>
      {(headerTitle || headerSubtitle) && (
        <div className="px-5 py-4 sm:px-6 border-b border-border">
          {headerTitle && <h2 className="text-base font-semibold">{headerTitle}</h2>}
          {headerSubtitle && <p className="text-sm text-text-muted mt-1">{headerSubtitle}</p>}
        </div>
      )}
      <div className={!className.includes('p-0') ? 'p-5 sm:p-6' : ''}>{children}</div>
    </div>
  );
}
