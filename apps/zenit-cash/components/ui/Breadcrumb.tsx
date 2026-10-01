// frontend/components/ui/Breadcrumb.tsx
import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center text-sm text-text-muted mb-4">
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <ChevronRight size={14} className="mx-2 text-text-subtle" />
          )}
          
          {item.href ? (
            <Link 
              href={item.href}
              className="hover:text-text transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-text-muted font-medium">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}