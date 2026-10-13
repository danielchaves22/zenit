import Link, { LinkProps } from 'next/link';
import { useRouter } from 'next/router';
import { ChevronRight } from 'lucide-react';
import { useNavigation } from '@/contexts/NavigationContext';

export interface BreadcrumbItem {
  label: string;
  href?: LinkProps['href'];
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const router = useRouter();
  const { request } = useNavigation();
  return (
    <nav aria-label="Navegação estrutural" className="breadcrumb">
      <ol>
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={item.label}>
              {index > 0 && <ChevronRight size={14} aria-hidden="true" />}
              {item.href && !current ? (
                <Link
                  href={item.href}
                  onNavigate={(event) => {
                    event.preventDefault();
                    request(() => {
                      void router.push(item.href!);
                    });
                  }}
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={current ? 'page' : undefined}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
