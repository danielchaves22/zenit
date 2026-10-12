import { ReactNode } from 'react';
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="admin-page-header">
      <h1>{title}</h1>
      {children && <div className="admin-page-actions">{children}</div>}
    </div>
  );
}
