import React, { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/ToastContext';
import {
  FinancialPlanningApiError,
  FinancialPlanningGuidanceResult,
  getFinancialPlanningGuidance
} from '@/lib/financial-planning-analysis';
import { FinancialPlanningAiGuidance } from './FinancialPlanningAiGuidance';

export function FinancialPlanningGuidanceArchive({ snapshotId }: { snapshotId: number }) {
  const { addToast } = useToast();
  const [records, setRecords] = useState<FinancialPlanningGuidanceResult[]>([]);
  const [selected, setSelected] = useState<FinancialPlanningGuidanceResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setRecords([]);
    setSelected(null);
    setLoading(true);
    void getFinancialPlanningGuidance(snapshotId, { limit: 10 })
      .then((page) => {
        if (!active) return;
        setRecords(page.items);
        setSelected(page.items[0] ?? null);
      })
      .catch((error: any) => {
        if (!active) return;
        const response = error.response?.data as FinancialPlanningApiError | undefined;
        addToast(response?.error || 'Erro ao consultar pareceres salvos', 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [addToast, snapshotId]);

  return (
    <FinancialPlanningAiGuidance
      result={selected}
      history={records}
      historyLoading={loading}
      loading={false}
      onSelect={setSelected}
    />
  );
}
