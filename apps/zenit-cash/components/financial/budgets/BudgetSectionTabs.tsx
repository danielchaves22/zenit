import Link from 'next/link';
import React from 'react';

export type BudgetSectionView = 'overview' | 'availability' | 'monthly' | 'provisions';

const tabs: Array<{ view: BudgetSectionView; label: string }> = [
  { view: 'overview', label: 'Visão geral' },
  { view: 'availability', label: 'Plano de disponibilidade' },
  { view: 'monthly', label: 'Planejamento mensal' },
  { view: 'provisions', label: 'Provisões' }
];

export function BudgetSectionTabs({
  activeView,
  month
}: {
  activeView: BudgetSectionView;
  month: string;
}) {
  return (
    <nav
      aria-label="Áreas do orçamento"
      className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-gray-700 bg-surface p-1"
    >
      {tabs.map((tab) => {
        const isActive = tab.view === activeView;

        return (
          <Link
            key={tab.view}
            href={{ pathname: '/financial/budgets', query: { view: tab.view, month } }}
            aria-current={isActive ? 'page' : undefined}
            className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-accent text-white shadow-sm'
                : 'text-gray-400 hover:bg-elevated hover:text-white'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
