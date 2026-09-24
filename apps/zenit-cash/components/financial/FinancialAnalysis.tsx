import React from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import FinancialForecast from './FinancialForecast';
import FinancialDashboard from './Dashboard';

export default function FinancialAnalysis() {
  const router = useRouter();
  const { companyId, user } = useAuth();
  const history = router.query.view === 'history';
  const month = typeof router.query.month === 'string' ? router.query.month : undefined;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Análise financeira</h1>
        <p className="mt-1 text-sm text-gray-400">
          Entenda a previsão dos próximos meses e acompanhe seu histórico.
        </p>
      </div>
      <nav
        aria-label="Áreas da análise financeira"
        className="flex gap-2 border-b border-gray-800 pb-3"
      >
        {(['monthly', 'history'] as const).map((view) => (
          <button
            key={view}
            type="button"
            aria-current={history === (view === 'history') ? 'page' : undefined}
            onClick={() =>
              void router.replace(
                { pathname: router.pathname, query: { ...router.query, view } },
                undefined,
                { shallow: true }
              )
            }
            className={`rounded-lg px-4 py-2 text-sm ${history === (view === 'history') ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
          >
            {view === 'monthly' ? 'Previsão' : 'Histórico'}
          </button>
        ))}
      </nav>
      {router.isReady && (
        <div key={`${user?.id}:${companyId}`} hidden={history}>
          <FinancialForecast
            initialMonth={month}
            onMonthChange={(value) =>
              void router.replace(
                {
                  pathname: router.pathname,
                  query: { ...router.query, view: 'monthly', month: value }
                },
                undefined,
                { shallow: true }
              )
            }
          />
        </div>
      )}
      {history && <FinancialDashboard key={`${user?.id}:${companyId}`} historyOnly />}
    </div>
  );
}
