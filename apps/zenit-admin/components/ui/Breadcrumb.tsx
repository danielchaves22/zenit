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
    <nav aria-label="Navegação estrutural" className="flex flex-wrap items-center gap-y-1 text-sm text-gray-400 mb-4">
      {items.map((item, index) => (
        <span key={index} className="inline-flex min-w-0 items-center">
          {index > 0 && (
            <ChevronRight size={14} className="mx-2 shrink-0 text-gray-500" />
          )}
          
          {item.href ? (
            <Link 
              href={item.href}
              className="hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-300 font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}