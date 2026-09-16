import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Target,
  WalletCards,
  X
} from 'lucide-react';
import CategorySelect, { CategoryOption } from '@/components/financial/CategorySelect';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { InfoModalButton } from '@/components/ui/InfoModalButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
import { useConfirmation } from '@/hooks/useConfirmation';
import api from '@/lib/api';
import {
  FinancialProvision,
  FinancialProvisionEntryType,
  FinancialProvisionInput,
  FinancialProvisionKind,
  FinancialProvisionListResponse,
  FinancialProvisionState,
  addFinancialProvisionEntry,
  cancelFinancialProvision,
  createFinancialProvision,
  getFinancialProvisions,
  updateFinancialProvision,
  useFinancialProvision
} from '@/lib/financial-provisions';

interface ExpenseCategory extends CategoryOption {
  type: 'EXPENSE';
  icon: string;
}

interface ProvisionDraft {
  name: string;
  categoryId: string;
  kind: FinancialProvisionKind;
  expectedAmount: string;
  initialReservedAmount: string;
  startMonth: string;
  targetDate: string;
  notes: string;
}

type ActivityKind = 'CONTRIBUTION' | 'WITHDRAWAL' | 'USE';
type ListFilter = 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'ALL';

interface ActivityDraft {
  provisionId: number;
  kind: ActivityKind;
  amount: string;
  occurredAt: string;
  notes: string;
}

function currentMonthKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

function todayKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
}

function maximumDateKey(): string {
  const today = new Date();
  return `${today.getFullYear() + 10}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
}

function dateMonthsFromNow(offset: number): string {
  const today = new Date();
  const target = new Date(today.getFullYear(), today.getMonth() + offset, today.getDate(), 12);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(
    target.getDate()
  ).padStart(2, '0')}`;
}

function emptyDraft(): ProvisionDraft {
  return {
    name: '',
    categoryId: '',
    kind: 'ONE_TIME',
    expectedAmount: '0.00',
    initialReservedAmount: '0.00',
    startMonth: currentMonthKey(),
    targetDate: dateMonthsFromNow(3),
    notes: ''
  };
}

function draftFromProvision(provision: FinancialProvision): ProvisionDraft {
  return {
    name: provision.name,
    categoryId: String(provision.category.id),
    kind: provision.kind,
    expectedAmount: provision.expectedAmount,
    initialReservedAmount: provision.reservedAmount,
    startMonth: provision.startMonth,
    targetDate: provision.targetDate,
    notes: provision.notes || ''
  };
}

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value));
}

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day, 12));
}

function statePresentation(state: FinancialProvisionState) {
  const presentations: Record<
    FinancialProvisionState,
    { label: string; className: string; bar: string }
  > = {
    PLANNED: {
      label: 'Planejada',
      className: 'border-blue-800 bg-blue-950/40 text-blue-300',
      bar: 'bg-blue-500'
    },
    IN_PROGRESS: {
      label: 'Em formação',
      className: 'border-amber-800 bg-amber-950/40 text-amber-300',
      bar: 'bg-amber-500'
    },
    FUNDED: {
      label: 'Provisionada',
      className: 'border-emerald-800 bg-emerald-950/40 text-emerald-300',
      bar: 'bg-emerald-500'
    },
    OVERDUE: {
      label: 'Atrasada',
      className: 'border-red-800 bg-red-950/40 text-red-300',
      bar: 'bg-red-500'
    },
    COMPLETED: {
      label: 'Concluída',
      className: 'border-gray-600 bg-gray-800/60 text-gray-300',
      bar: 'bg-gray-500'
    },
    CANCELED: {
      label: 'Cancelada',
      className: 'border-gray-700 bg-gray-900/60 text-gray-500',
      bar: 'bg-gray-700'
    }
  };
  return presentations[state];
}

function entryLabel(type: FinancialProvisionEntryType): string {
  return {
    INITIAL_BALANCE: 'Saldo inicial',
    CONTRIBUTION: 'Aporte',
    WITHDRAWAL: 'Retirada',
    USE: 'Utilização'
  }[type];
}

export function FinancialProvisions() {
  const { addToast } = useToast();
  const confirmation = useConfirmation();
  const [data, setData] = useState<FinancialProvisionListResponse | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProvisionDraft>(emptyDraft);
  const [activity, setActivity] = useState<ActivityDraft | null>(null);
  const [filter, setFilter] = useState<ListFilter>('ACTIVE');

  async function load() {
    setLoading(true);
    try {
      const [provisionResponse, categoryResponse] = await Promise.all([
        getFinancialProvisions(),
        api.get('/financial/categories', { params: { type: 'EXPENSE' } })
      ]);
      setData(provisionResponse);
      setCategories((categoryResponse.data || []) as ExpenseCategory[]);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar provisões', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function refreshProvisions() {
    const response = await getFinancialProvisions();
    setData(response);
  }

  useEffect(() => {
    void load();
  }, []);

  const visibleItems = useMemo(() => {
    if (filter === 'ALL') return data?.items || [];
    return (data?.items || []).filter((item) => item.status === filter);
  }, [data, filter]);
  const canManage = data?.access.canManage ?? false;

  function openCreate() {
    setDraft(emptyDraft());
    setEditingId(null);
    setEditorOpen(true);
    setActivity(null);
  }

  function openEdit(provision: FinancialProvision) {
    setDraft(draftFromProvision(provision));
    setEditingId(provision.id);
    setEditorOpen(true);
    setActivity(null);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    setDraft(emptyDraft());
  }

  async function saveProvision(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.categoryId || Number(draft.expectedAmount) <= 0) {
      addToast('Informe nome, categoria e valor previsto maior que zero', 'error');
      return;
    }
    if (!editingId && Number(draft.initialReservedAmount) > Number(draft.expectedAmount)) {
      addToast('O valor já reservado não pode superar o valor previsto', 'error');
      return;
    }

    const input: FinancialProvisionInput = {
      name: draft.name.trim(),
      categoryId: Number(draft.categoryId),
      kind: draft.kind,
      expectedAmount: draft.expectedAmount,
      startMonth: draft.startMonth,
      targetDate: draft.targetDate,
      notes: draft.notes.trim() || null
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateFinancialProvision(editingId, input);
        addToast('Provisão alterada', 'success');
      } else {
        await createFinancialProvision({
          ...input,
          initialReservedAmount: draft.initialReservedAmount
        });
        addToast('Provisão criada', 'success');
      }
      closeEditor();
      await refreshProvisions();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar provisão', 'error');
    } finally {
      setSaving(false);
    }
  }

  function openActivity(provision: FinancialProvision, kind: ActivityKind) {
    const suggestedAmount =
      kind === 'CONTRIBUTION'
        ? provision.monthlyContributionAmount
        : kind === 'WITHDRAWAL'
          ? provision.reservedAmount
          : provision.expectedAmount;
    setActivity({
      provisionId: provision.id,
      kind,
      amount: suggestedAmount,
      occurredAt: todayKey(),
      notes: ''
    });
    setEditorOpen(false);
  }

  async function persistActivity(current: ActivityDraft) {
    setSaving(true);
    try {
      if (current.kind === 'USE') {
        await useFinancialProvision(current.provisionId, {
          actualAmount: current.amount,
          occurredAt: current.occurredAt,
          notes: current.notes.trim() || null
        });
        addToast('Utilização da provisão registrada', 'success');
      } else {
        await addFinancialProvisionEntry(current.provisionId, {
          type: current.kind,
          amount: current.amount,
          occurredAt: current.occurredAt,
          notes: current.notes.trim() || null
        });
        addToast(current.kind === 'CONTRIBUTION' ? 'Aporte registrado' : 'Retirada registrada', 'success');
      }
      setActivity(null);
      await refreshProvisions();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao registrar movimentação', 'error');
      throw error;
    } finally {
      setSaving(false);
    }
  }

  function submitActivity(event: React.FormEvent) {
    event.preventDefault();
    if (!activity || Number(activity.amount) <= 0) {
      addToast('Informe um valor maior que zero', 'error');
      return;
    }
    if (activity.kind !== 'USE') {
      void persistActivity(activity).catch(() => undefined);
      return;
    }

    const provision = data?.items.find((item) => item.id === activity.provisionId);
    confirmation.confirm(
      {
        title: 'Confirmar utilização da provisão',
        message:
          provision?.kind === 'ANNUAL'
            ? `Será registrada a utilização de ${formatMoney(activity.amount)} e a provisão ${provision.name} será preparada para o próximo ciclo anual.`
            : `Será registrada a utilização de ${formatMoney(activity.amount)} e a provisão ${provision?.name || ''} será concluída.`,
        confirmText: 'Registrar utilização',
        type: 'warning'
      },
      () => persistActivity(activity)
    );
  }

  function handleCancel(provision: FinancialProvision) {
    confirmation.confirm(
      {
        title: 'Cancelar provisão',
        message: `A provisão ${provision.name} deixará de participar dos cálculos. O histórico será preservado e nenhuma transação será alterada.`,
        confirmText: 'Cancelar provisão',
        type: 'danger'
      },
      async () => {
        try {
          await cancelFinancialProvision(provision.id);
          await refreshProvisions();
          addToast('Provisão cancelada', 'success');
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao cancelar provisão', 'error');
          throw error;
        }
      }
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-white">Provisões</h2>
          <InfoModalButton modalTitle="Sobre Provisões" buttonLabel="Ajuda sobre Provisões">
            <p>
              Provisões reservam, no planejamento, dinheiro para despesas futuras previsíveis, como
              IPVA, seguro, manutenção ou uma compra programada.
            </p>
            <p>
              <strong className="text-white">Única:</strong> termina quando o valor é utilizado.
              <strong className="ml-2 text-white">Anual:</strong> abre automaticamente o próximo ciclo
              após a utilização.
            </p>
            <p>
              Aportes e retiradas são registros de controle. Eles não movimentam contas nem criam
              transações. Quando o dinheiro for efetivamente gasto, registre a transação normalmente.
            </p>
          </InfoModalButton>
        </div>
        {canManage && (
          <Button variant="accent" onClick={openCreate} className="inline-flex items-center gap-2">
            <Plus size={17} />
            Nova provisão
          </Button>
        )}
      </div>

      {!canManage && (
        <div className="rounded-lg border border-blue-900/70 bg-blue-950/20 px-4 py-3 text-sm text-blue-200">
          Você pode consultar as provisões. Somente gestores do workspace podem alterá-las.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryMetric
          label="Aporte mensal necessário"
          value={formatMoney(summary?.monthlyContributionAmount || 0)}
          icon={<CalendarClock size={18} />}
          tone="accent"
        />
        <SummaryMetric
          label="Já reservado"
          value={formatMoney(summary?.reservedAmount || 0)}
          icon={<WalletCards size={18} />}
        />
        <SummaryMetric
          label="Ainda falta reservar"
          value={formatMoney(summary?.remainingAmount || 0)}
          icon={<Target size={18} />}
        />
        <SummaryMetric
          label="Provisões ativas"
          value={String(summary?.activeCount || 0)}
          detail={summary?.overdueCount ? `${summary.overdueCount} atrasada(s)` : `${summary?.fundedCount || 0} completas`}
          icon={<CircleDollarSign size={18} />}
          tone={summary?.overdueCount ? 'danger' : 'neutral'}
        />
      </div>

      <div className="rounded-lg border border-blue-900/70 bg-blue-950/20 px-4 py-3 text-sm text-blue-200">
        O valor reservado é declaratório: ele reduz sua disponibilidade para decisões, mas não altera o
        saldo de nenhuma conta.
      </div>

      {canManage && editorOpen && (
        <ProvisionEditor
          draft={draft}
          setDraft={setDraft}
          categories={categories}
          editing={editingId !== null}
          saving={saving}
          onSubmit={saveProvision}
          onClose={closeEditor}
        />
      )}

      <div className="flex flex-wrap gap-2" aria-label="Filtrar provisões">
        {(
          [
            ['ACTIVE', 'Ativas'],
            ['COMPLETED', 'Concluídas'],
            ['CANCELED', 'Canceladas'],
            ['ALL', 'Todas']
          ] as Array<[ListFilter, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              filter === value
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {visibleItems.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <CalendarClock className="mx-auto text-gray-600" size={36} />
            <p className="mt-3 font-medium text-white">
              {filter === 'ACTIVE' ? 'Nenhuma provisão ativa' : 'Nenhuma provisão neste filtro'}
            </p>
            <p className="mt-1 text-sm text-gray-400">
              Antecipe despesas previsíveis para não tratá-las como surpresas no orçamento.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visibleItems.map((provision) => (
            <ProvisionCard
              key={provision.id}
              provision={provision}
              activity={activity?.provisionId === provision.id ? activity : null}
              setActivity={setActivity}
              saving={saving}
              canManage={canManage}
              onEdit={() => openEdit(provision)}
              onOpenActivity={(kind) => openActivity(provision, kind)}
              onSubmitActivity={submitActivity}
              onCancel={() => handleCancel(provision)}
            />
          ))}
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmation.isOpen}
        onClose={confirmation.handleClose}
        onConfirm={confirmation.handleConfirm}
        loading={confirmation.loading}
        {...confirmation.options}
      />
    </div>
  );
}

function ProvisionEditor({
  draft,
  setDraft,
  categories,
  editing,
  saving,
  onSubmit,
  onClose
}: {
  draft: ProvisionDraft;
  setDraft: React.Dispatch<React.SetStateAction<ProvisionDraft>>;
  categories: ExpenseCategory[];
  editing: boolean;
  saving: boolean;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <Card className="border-accent/60">
      <form onSubmit={onSubmit}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">
            {editing ? 'Alterar provisão' : 'Nova provisão'}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="mb-4 block text-sm font-medium text-gray-300">
            Nome <span className="text-red-400">*</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              maxLength={100}
              required
              placeholder="Ex.: IPVA, seguro, manutenção"
              className="mt-1 w-full rounded border border-gray-700 bg-background px-3 py-2 text-white outline-none focus:border-accent focus:ring"
            />
          </label>
          <CategorySelect
            label="Categoria *"
            categories={categories}
            value={draft.categoryId}
            onChange={(categoryId) => setDraft((current) => ({ ...current, categoryId }))}
            placeholder="Selecione uma despesa"
            className="mb-4"
          />
          <label className="mb-4 block text-sm font-medium text-gray-300">
            Frequência
            <select
              value={draft.kind}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  kind: event.target.value as FinancialProvisionKind
                }))
              }
              className="mt-1 w-full rounded border border-gray-700 bg-background px-3 py-2 text-white outline-none focus:border-accent focus:ring"
            >
              <option value="ONE_TIME">Única</option>
              <option value="ANNUAL">Anual</option>
            </select>
          </label>
          <CurrencyInput
            label="Valor previsto"
            value={draft.expectedAmount}
            onChange={(expectedAmount) => setDraft((current) => ({ ...current, expectedAmount }))}
            required
          />
          {!editing && (
            <CurrencyInput
              label="Valor já reservado"
              value={draft.initialReservedAmount}
              onChange={(initialReservedAmount) =>
                setDraft((current) => ({ ...current, initialReservedAmount }))
              }
            />
          )}
          <label className="mb-4 block text-sm font-medium text-gray-300">
            Iniciar aportes em
            <input
              type="month"
              value={draft.startMonth}
              min={editing ? undefined : currentMonthKey()}
              max={maximumDateKey().slice(0, 7)}
              onChange={(event) => setDraft((current) => ({ ...current, startMonth: event.target.value }))}
              required
              className="mt-1 w-full rounded border border-gray-700 bg-background px-3 py-2 text-white outline-none focus:border-accent focus:ring"
            />
          </label>
          <label className="mb-4 block text-sm font-medium text-gray-300">
            Data prevista
            <input
              type="date"
              value={draft.targetDate}
              min={todayKey()}
              max={maximumDateKey()}
              onChange={(event) => setDraft((current) => ({ ...current, targetDate: event.target.value }))}
              required
              className="mt-1 w-full rounded border border-gray-700 bg-background px-3 py-2 text-white outline-none focus:border-accent focus:ring"
            />
          </label>
          <label className="mb-4 block text-sm font-medium text-gray-300 md:col-span-2 xl:col-span-3">
            Observações
            <textarea
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              maxLength={500}
              rows={2}
              className="mt-1 w-full resize-y rounded border border-gray-700 bg-background px-3 py-2 text-white outline-none focus:border-accent focus:ring"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" variant="accent" disabled={saving} className="inline-flex items-center gap-2">
            {saving && <Loader2 size={16} className="animate-spin" />}
            {editing ? 'Salvar alterações' : 'Criar provisão'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ProvisionCard({
  provision,
  activity,
  setActivity,
  saving,
  canManage,
  onEdit,
  onOpenActivity,
  onSubmitActivity,
  onCancel
}: {
  provision: FinancialProvision;
  activity: ActivityDraft | null;
  setActivity: React.Dispatch<React.SetStateAction<ActivityDraft | null>>;
  saving: boolean;
  canManage: boolean;
  onEdit: () => void;
  onOpenActivity: (kind: ActivityKind) => void;
  onSubmitActivity: (event: React.FormEvent) => void;
  onCancel: () => void;
}) {
  const presentation = statePresentation(provision.state);
  const isActive = provision.status === 'ACTIVE';

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-semibold text-white">{provision.name}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-xs ${presentation.className}`}>
              {presentation.label}
            </span>
            {provision.kind === 'ANNUAL' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-800 bg-violet-950/30 px-2 py-0.5 text-xs text-violet-300">
                <RefreshCw size={11} /> Anual
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-400">
            {provision.category.name} · prevista para {formatDate(provision.targetDate)}
          </p>
        </div>
        {provision.state === 'FUNDED' ? (
          <CheckCircle2 className="shrink-0 text-emerald-400" size={24} />
        ) : provision.state === 'OVERDUE' ? (
          <AlertTriangle className="shrink-0 text-red-400" size={24} />
        ) : (
          <CalendarClock className="shrink-0 text-accent" size={24} />
        )}
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-gray-800">
        <div
          className={`h-full rounded-full transition-all ${presentation.bar}`}
          style={{ width: `${Math.min(provision.progressPercent, 100)}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-gray-500">
        <span>{formatMoney(provision.reservedAmount)} reservados</span>
        <span>{provision.progressPercent.toLocaleString('pt-BR')}%</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="Valor previsto" value={formatMoney(provision.expectedAmount)} />
        <Metric label="Ainda falta" value={formatMoney(provision.remainingAmount)} />
        <Metric
          label="Aporte mensal sugerido"
          value={formatMoney(provision.monthlyContributionAmount)}
          highlight
        />
        <Metric
          label="Prazo de formação"
          value={isActive ? `${provision.monthsRemaining} mês(es)` : 'Encerrada'}
        />
      </div>

      {provision.notes && <p className="mt-4 text-sm text-gray-400">{provision.notes}</p>}

      {isActive && canManage && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="accent" onClick={() => onOpenActivity('CONTRIBUTION')}>
            Registrar aporte
          </Button>
          <Button variant="outline" onClick={() => onOpenActivity('WITHDRAWAL')} disabled={Number(provision.reservedAmount) <= 0}>
            Registrar retirada
          </Button>
          <Button variant="outline" onClick={() => onOpenActivity('USE')}>
            Utilizar
          </Button>
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 px-2 text-sm text-gray-400 hover:text-white">
            <Pencil size={14} /> Editar
          </button>
          <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 px-2 text-sm text-red-400 hover:text-red-300">
            <X size={14} /> Cancelar
          </button>
        </div>
      )}

      {canManage && activity && (
        <form onSubmit={onSubmitActivity} className="mt-5 rounded-lg border border-gray-700 bg-[#11161d] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-medium text-white">
              {activity.kind === 'CONTRIBUTION'
                ? 'Registrar aporte'
                : activity.kind === 'WITHDRAWAL'
                  ? 'Registrar retirada'
                  : 'Registrar utilização'}
            </h4>
            <button type="button" onClick={() => setActivity(null)} className="text-gray-500 hover:text-white" aria-label="Fechar movimentação">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            <CurrencyInput
              label={activity.kind === 'USE' ? 'Valor efetivamente utilizado' : 'Valor'}
              value={activity.amount}
              onChange={(amount) => setActivity((current) => (current ? { ...current, amount } : current))}
              required
            />
            <label className="mb-4 block text-sm font-medium text-gray-300">
              Data
              <input
                type="date"
                max={todayKey()}
                value={activity.occurredAt}
                onChange={(event) =>
                  setActivity((current) =>
                    current ? { ...current, occurredAt: event.target.value } : current
                  )
                }
                required
                className="mt-1 w-full rounded border border-gray-700 bg-background px-3 py-2 text-white outline-none focus:border-accent focus:ring"
              />
            </label>
          </div>
          <label className="mb-4 block text-sm font-medium text-gray-300">
            Observação
            <input
              value={activity.notes}
              onChange={(event) =>
                setActivity((current) =>
                  current ? { ...current, notes: event.target.value } : current
                )
              }
              maxLength={300}
              className="mt-1 w-full rounded border border-gray-700 bg-background px-3 py-2 text-white outline-none focus:border-accent focus:ring"
            />
          </label>
          <div className="flex justify-end">
            <Button type="submit" variant={activity.kind === 'USE' ? 'accent' : 'primary'} disabled={saving}>
              {saving ? 'Registrando...' : 'Registrar'}
            </Button>
          </div>
        </form>
      )}

      {provision.entries.length > 0 && (
        <details className="mt-5 border-t border-gray-800 pt-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-gray-400 hover:text-white">
            <History size={15} /> Histórico ({provision.entries.length})
          </summary>
          <div className="mt-3 space-y-2">
            {provision.entries.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <span className="text-gray-300">{entryLabel(entry.type)}</span>
                  <span className="ml-2 text-xs text-gray-600">{formatDate(entry.occurredAt)}</span>
                  {entry.notes && <p className="text-xs text-gray-500">{entry.notes}</p>}
                  {entry.type === 'USE' &&
                    Math.abs(Number(entry.reservedAmountChange)) !== Number(entry.amount) && (
                      <p className="text-xs text-gray-500">
                        Reserva liberada: {formatMoney(Math.abs(Number(entry.reservedAmountChange)))}
                      </p>
                    )}
                </div>
                <span
                  className={
                    entry.type === 'WITHDRAWAL' || entry.type === 'USE'
                      ? 'text-red-300'
                      : 'text-emerald-300'
                  }
                >
                  {entry.type === 'INITIAL_BALANCE' || entry.type === 'CONTRIBUTION' ? '+' : '−'}
                  {formatMoney(entry.amount)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
  icon,
  tone = 'neutral'
}: {
  label: string;
  value: string;
  detail?: string;
  icon: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'danger';
}) {
  const toneClass = tone === 'danger' ? 'text-red-300' : tone === 'accent' ? 'text-accent' : 'text-white';
  return (
    <Card className="p-0">
      <div className="p-4">
        <div className="flex items-center justify-between gap-2 text-gray-500">
          <p className="text-xs">{label}</p>
          <span className={toneClass}>{icon}</span>
        </div>
        <p className={`mt-2 text-lg font-semibold ${toneClass}`}>{value}</p>
        {detail && <p className="mt-1 text-xs text-gray-500">{detail}</p>}
      </div>
    </Card>
  );
}

function Metric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-[#11161d] p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 font-semibold ${highlight ? 'text-accent' : 'text-white'}`}>{value}</p>
    </div>
  );
}
