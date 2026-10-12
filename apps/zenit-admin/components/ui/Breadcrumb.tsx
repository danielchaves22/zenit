import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
export interface BreadcrumbItem {
  label: string;
  href?: string;
}
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Navegação estrutural" className="admin-breadcrumb">
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 && <ChevronRight size={13} aria-hidden="true" />}
          {item.href ? (
            <Link href={item.href}>{item.label}</Link>
          ) : (
            <span aria-current={index === items.length - 1 ? 'page' : undefined}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
