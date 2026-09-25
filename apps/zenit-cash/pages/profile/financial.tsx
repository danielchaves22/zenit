import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  Save,
  ShieldCheck,
  UserRoundCog
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { InfoModalButton } from '@/components/ui/InfoModalButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
import { CategoryIcon } from '@/utils/categoryIcons';
import { orderCategoriesForSelect } from '@/components/financial/CategorySelect';
import {
  PersonalAdjustmentPace,
  PersonalCategoryFlexibility,
  PersonalFinancialDataCoverage,
  PersonalFinancialProfileResponse,
  PersonalPlanningContext,
  PersonalPlanningStyle,
  SavePersonalFinancialProfileInput,
  getPersonalFinancialProfile,
  savePersonalFinancialProfile
} from '@/lib/personal-financial-profile';

interface Draft {
  planningContext: PersonalPlanningContext | '';
  adultsCount: string;
  dependentsCount: string;
  financialDataCoverage: PersonalFinancialDataCoverage | '';
  emergencyReserveTargetMonths: string;
  planningStyle: PersonalPlanningStyle | '';
  adjustmentPace: PersonalAdjustmentPace | '';
  categoryPrioritiesReviewed: boolean;
  categoryPreferences: Record<
    number,
    { flexibility: PersonalCategoryFlexibility; minimumMonthlyAmount: string }
  >;
}

function emptyDraft(): Draft {
  return {
    planningContext: '',
    adultsCount: '',
    dependentsCount: '',
    financialDataCoverage: '',
    emergencyReserveTargetMonths: '',
    planningStyle: '',
    adjustmentPace: '',
    categoryPrioritiesReviewed: false,
    categoryPreferences: {}
  };
}

function draftFromResponse(response: PersonalFinancialProfileResponse): Draft {
  const profile = response.profile;
  const preferences = Object.fromEntries(
    response.categories.map((category) => {
      const saved = profile?.categoryPreferences.find(
        (preference) => preference.categoryId === category.id
      );
      return [
        category.id,
        {
          flexibility: saved?.flexibility || ('MODERATE' as const),
          minimumMonthlyAmount: saved?.minimumMonthlyAmount || '0.00'
        }
      ];
    })
  );

  return {
    planningContext: profile?.planningContext || '',
    adultsCount: profile?.adultsCount === null || profile?.adultsCount === undefined
      ? ''
      : String(profile.adultsCount),
    dependentsCount:
      profile?.dependentsCount === null || profile?.dependentsCount === undefined
        ? ''
        : String(profile.dependentsCount),
    financialDataCoverage: profile?.financialDataCoverage || '',
    emergencyReserveTargetMonths:
      profile?.emergencyReserveTargetMonths === null ||
      profile?.emergencyReserveTargetMonths === undefined
        ? ''
        : String(profile.emergencyReserveTargetMonths),
    planningStyle: profile?.planningStyle || '',
    adjustmentPace: profile?.adjustmentPace || '',
    categoryPrioritiesReviewed:
      response.state === 'OUTDATED' ? false : profile?.categoryPrioritiesReviewed || false,
    categoryPreferences: preferences
  };
}

function nullableNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value: string | null): string {
  if (!value) return 'Ainda não revisado';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date(value));
}

const statePresentation = {
  NOT_CONFIGURED: {
    label: 'Não configurado',
    className: 'border-gray-700 bg-gray-900 text-gray-300',
    icon: UserRoundCog
  },
  INCOMPLETE: {
    label: 'Incompleto',
    className: 'border-amber-800 bg-amber-950/40 text-amber-300',
    icon: AlertTriangle
  },
  READY: {
    label: 'Pronto',
    className: 'border-emerald-800 bg-emerald-950/40 text-emerald-300',
    icon: CheckCircle2
  },
  OUTDATED: {
    label: 'Precisa de revisão',
    className: 'border-orange-800 bg-orange-950/40 text-orange-300',
    icon: Clock3
  }
};

const profileFieldHelp = {
  planningContext: (
    <>
      <p>
        Escolha <strong>Apenas para mim</strong> quando os lançamentos representam somente a sua
        vida financeira.
      </p>
      <p>
        Escolha <strong>Para minha família</strong> quando o workspace representa o orçamento
        compartilhado da casa, mesmo que apenas uma pessoa faça os lançamentos.
      </p>
      <p>Essa escolha não adiciona usuários nem altera as permissões do workspace.</p>
    </>
  ),
  dataCoverage: (
    <>
      <p>
        Marque <strong>Representam todo o orçamento</strong> quando as receitas e despesas
        relevantes estão registradas no Zenit.
      </p>
      <p>
        Marque <strong>Representam apenas uma parte</strong> se ainda existem rendas, contas,
        cartões ou gastos importantes controlados fora do sistema.
      </p>
      <p>
        A cobertura parcial não impede a análise, mas reduz sua pontuação de qualidade e faz o
        Zenit apresentar conclusões com mais cautela.
      </p>
    </>
  ),
  adults: (
    <>
      <p>Informe quantos adultos têm receitas ou despesas incluídas neste orçamento.</p>
      <p>
        Em um planejamento familiar, conte você, cônjuge ou outro adulto cuja vida financeira
        faça parte do workspace. Não conte aqui crianças ou outros dependentes financeiros.
      </p>
    </>
  ),
  dependents: (
    <>
      <p>
        Informe quantas pessoas são sustentadas total ou parcialmente por este orçamento sem
        possuir uma vida financeira independente nele.
      </p>
      <p>
        Exemplos comuns são filhos, idosos ou outros familiares dependentes. Um cônjuge já contado
        como adulto não deve ser repetido aqui.
      </p>
    </>
  ),
  reserve: (
    <>
      <p>
        Defina quantos meses de despesas essenciais você deseja que sua reserva de emergência
        consiga cobrir.
      </p>
      <p>
        Informe a quantidade de meses, não o saldo atual nem um valor em reais. Por exemplo, 6
        significa uma meta equivalente a seis meses de despesas essenciais.
      </p>
      <p>Essa meta não movimenta dinheiro nem cria uma provisão automaticamente.</p>
    </>
  ),
  planningStyle: (
    <>
      <p><strong>Conservador:</strong> prioriza preservar margens de segurança e estabilidade.</p>
      <p><strong>Equilibrado:</strong> busca conciliar proteção e espaço para ajustes.</p>
      <p><strong>Flexível:</strong> indica maior disposição para rever gastos discricionários.</p>
      <p>Essa escolha registra sua preferência e não altera limites automaticamente.</p>
    </>
  ),
  adjustmentPace: (
    <>
      <p>
        Escolha <strong>Gradual</strong> se prefere incorporar mudanças de hábito e de orçamento ao
        longo dos meses.
      </p>
      <p>
        Escolha <strong>Imediato</strong> se está disposto a aplicar os ajustes já no próximo ciclo
        de planejamento.
      </p>
      <p>O ritmo declarado não agenda nem aplica mudanças sem sua confirmação.</p>
    </>
  ),
  categoryPriorities: (
    <>
      <p><strong>Protegida:</strong> não é reduzida pelos cenários sugeridos.</p>
      <p><strong>Moderada:</strong> só é ajustada depois das categorias flexíveis.</p>
      <p><strong>Flexível:</strong> é considerada primeiro quando uma redução é necessária.</p>
      <p>
        O mínimo mensal funciona como um piso: mesmo quando houver sugestão de ajuste, o cenário
        preservará pelo menos esse valor.
      </p>
      <p>Nenhuma classificação altera seu planejamento sem revisão e confirmação.</p>
    </>
  )
};

export default function PersonalFinancialProfilePage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [response, setResponse] = useState<PersonalFinancialProfileResponse | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPersonalFinancialProfile()
      .then((result) => {
        if (cancelled) return;
        setResponse(result);
        setDraft(draftFromResponse(result));
      })
      .catch((error: any) => {
        if (!cancelled) {
          addToast(
            error.response?.data?.error || 'Erro ao carregar o perfil de planejamento financeiro',
            'error'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const orderedCategories = useMemo(
    () => orderCategoriesForSelect(response?.categories || []),
    [response?.categories]
  );

  function updatePreference(
    categoryId: number,
    patch: Partial<{ flexibility: PersonalCategoryFlexibility; minimumMonthlyAmount: string }>
  ) {
    setDraft((current) => {
      const currentPreference = current.categoryPreferences[categoryId] ?? {
        flexibility: 'MODERATE' as const,
        minimumMonthlyAmount: '0.00'
      };
      return {
        ...current,
        categoryPreferences: {
          ...current.categoryPreferences,
          [categoryId]: {
            ...currentPreference,
            ...patch
          }
        }
      };
    });
  }

  function selectPlanningContext(planningContext: PersonalPlanningContext) {
    setDraft((current) => ({
      ...current,
      planningContext,
      ...(planningContext === 'INDIVIDUAL'
        ? { adultsCount: '1' }
        : {})
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!response) return;

    const input: SavePersonalFinancialProfileInput = {
      planningContext: draft.planningContext || null,
      adultsCount: nullableNumber(draft.adultsCount),
      dependentsCount: nullableNumber(draft.dependentsCount),
      financialDataCoverage: draft.financialDataCoverage || null,
      emergencyReserveTargetMonths: nullableNumber(draft.emergencyReserveTargetMonths),
      planningStyle: draft.planningStyle || null,
      adjustmentPace: draft.adjustmentPace || null,
      categoryPrioritiesReviewed: draft.categoryPrioritiesReviewed,
      categoryPreferences: response.categories.map((category) => {
        const preference = draft.categoryPreferences[category.id] || {
          flexibility: 'MODERATE' as const,
          minimumMonthlyAmount: '0.00'
        };
        return {
          categoryId: category.id,
          flexibility: preference.flexibility,
          minimumMonthlyAmount:
            Number(preference.minimumMonthlyAmount) > 0
              ? preference.minimumMonthlyAmount
              : null
        };
      })
    };

    setSaving(true);
    try {
      const result = await savePersonalFinancialProfile(input);
      setResponse(result);
      setDraft(draftFromResponse(result));
      addToast(
        result.state === 'READY'
          ? 'Perfil de planejamento financeiro pronto para uso'
          : 'Perfil salvo como incompleto',
        'success'
      );

      const rawReturnTo = Array.isArray(router.query.returnTo)
        ? router.query.returnTo[0]
        : router.query.returnTo;
      if (
        result.state === 'READY' &&
        rawReturnTo?.startsWith('/') &&
        !rawReturnTo.startsWith('//')
      ) {
        await router.push(rawReturnTo);
      }
    } catch (error: any) {
      addToast(
        error.response?.data?.error || 'Erro ao salvar o perfil de planejamento financeiro',
        'error'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Perfil de Planejamento Financeiro">
        <div className="mx-auto max-w-5xl space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!response) {
    return (
      <DashboardLayout title="Perfil de Planejamento Financeiro">
        <Card className="mx-auto max-w-xl text-center">
          <AlertTriangle className="mx-auto text-amber-300" size={32} />
          <p className="mt-3 text-white">Não foi possível carregar o perfil financeiro.</p>
          <Button className="mt-4" variant="outline" onClick={() => void router.reload()}>
            Tentar novamente
          </Button>
        </Card>
      </DashboardLayout>
    );
  }

  const presentation = statePresentation[response.state];
  const StateIcon = presentation.icon;
  const canManage = response.access.canManage;

  return (
    <DashboardLayout title="Perfil de Planejamento Financeiro">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Meu perfil', href: '/profile' },
          { label: 'Perfil financeiro' }
        ]}
      />

      <form onSubmit={handleSubmit} className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-white">Perfil de planejamento financeiro</h1>
            <InfoModalButton
              modalTitle="Sobre o Perfil de Planejamento Financeiro"
              buttonLabel="Ajuda sobre o Perfil de Planejamento Financeiro"
            >
              <p>
                Este perfil registra o contexto e as prioridades do workspace atual. Renda,
                compromissos e médias continuam sendo calculados com os dados do Zenit.
              </p>
              <p>
                O perfil é compartilhado com os usuários autorizados deste workspace. Somente
                gestores podem alterá-lo; cada revisão registra quem realizou a mudança.
              </p>
            </InfoModalButton>
          </div>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${presentation.className}`}>
            <StateIcon size={15} />
            {presentation.label}
          </span>
        </div>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-400">Completude do perfil</p>
              <p className="mt-1 text-xl font-semibold text-white">
                {response.completionPercentage}%
              </p>
            </div>
            <div className="min-w-[220px] flex-1 sm:max-w-md">
              <div className="h-2 overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${response.completionPercentage}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Última revisão: {formatDate(response.profile?.lastReviewedAt || null)} · versão{' '}
                {response.profile?.version || 0}
              </p>
            </div>
            <div className="text-right text-sm text-gray-400">
              <p>Fonte dos dados</p>
              <p className="font-medium text-white">{response.workspace.name}</p>
            </div>
          </div>
        </Card>

        {!canManage && (
          <div className="rounded-lg border border-blue-900/70 bg-blue-950/20 px-4 py-3 text-sm text-blue-200">
            Você pode consultar este perfil. Somente gestores do workspace podem alterá-lo.
          </div>
        )}

        <fieldset aria-disabled={!canManage} className="space-y-5">
        <Card headerTitle="Contexto do planejamento">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ChoiceGroup
              label="Para quem você planeja?"
              help={profileFieldHelp.planningContext}
              value={draft.planningContext}
              options={[
                { value: 'INDIVIDUAL', label: 'Apenas para mim' },
                { value: 'FAMILY', label: 'Para minha família' }
              ]}
              disabled={!canManage}
              onChange={(value) => selectPlanningContext(value as PersonalPlanningContext)}
            />
            <ChoiceGroup
              label="Cobertura dos dados no Zenit"
              help={profileFieldHelp.dataCoverage}
              value={draft.financialDataCoverage}
              options={[
                { value: 'FULL', label: 'Representam todo o orçamento' },
                { value: 'PARTIAL', label: 'Representam apenas uma parte' }
              ]}
              disabled={!canManage}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  financialDataCoverage: value as PersonalFinancialDataCoverage
                }))
              }
            />
            <NumberField
              label="Adultos contemplados"
              help={profileFieldHelp.adults}
              value={draft.adultsCount}
              min={1}
              max={20}
              disabled={!canManage}
              onChange={(adultsCount) => setDraft((current) => ({ ...current, adultsCount }))}
            />
            <NumberField
              label="Dependentes financeiros"
              help={profileFieldHelp.dependents}
              value={draft.dependentsCount}
              min={0}
              max={30}
              disabled={!canManage}
              onChange={(dependentsCount) =>
                setDraft((current) => ({ ...current, dependentsCount }))
              }
            />
          </div>
        </Card>

        <Card headerTitle="Segurança e estilo de planejamento">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <NumberField
              label="Reserva desejada em meses"
              help={profileFieldHelp.reserve}
              value={draft.emergencyReserveTargetMonths}
              min={0}
              max={24}
              disabled={!canManage}
              onChange={(emergencyReserveTargetMonths) =>
                setDraft((current) => ({ ...current, emergencyReserveTargetMonths }))
              }
            />
            <SelectField
              label="Estilo de planejamento"
              help={profileFieldHelp.planningStyle}
              value={draft.planningStyle}
              disabled={!canManage}
              onChange={(planningStyle) =>
                setDraft((current) => ({
                  ...current,
                  planningStyle: planningStyle as PersonalPlanningStyle
                }))
              }
              options={[
                { value: 'CONSERVATIVE', label: 'Conservador' },
                { value: 'BALANCED', label: 'Equilibrado' },
                { value: 'FLEXIBLE', label: 'Flexível' }
              ]}
            />
            <SelectField
              label="Ritmo dos ajustes"
              help={profileFieldHelp.adjustmentPace}
              value={draft.adjustmentPace}
              disabled={!canManage}
              onChange={(adjustmentPace) =>
                setDraft((current) => ({
                  ...current,
                  adjustmentPace: adjustmentPace as PersonalAdjustmentPace
                }))
              }
              options={[
                { value: 'GRADUAL', label: 'Gradual' },
                { value: 'IMMEDIATE', label: 'Imediato' }
              ]}
            />
          </div>
        </Card>

        <Card headerTitle="Prioridades por categoria">
          <div className="mb-4 flex items-center gap-1.5 text-sm font-medium text-gray-300">
            <span>Como o Zenit pode ajustar cada categoria?</span>
            <FieldHelp label="Prioridades por categoria">
              {profileFieldHelp.categoryPriorities}
            </FieldHelp>
          </div>

          <div className="space-y-3">
            {orderedCategories.map(({ category, level, lineage }) => {
              const preference = draft.categoryPreferences[category.id] || {
                flexibility: 'MODERATE' as const,
                minimumMonthlyAmount: '0.00'
              };
              return (
                <div
                  key={category.id}
                  className="grid grid-cols-1 gap-3 rounded-lg border border-gray-700 bg-[#11161d] p-3 lg:grid-cols-[minmax(180px,1fr)_minmax(300px,auto)_180px] lg:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3" style={{ paddingLeft: `${Math.min(level, 3) * 12}px` }}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gray-700 bg-background">
                      <CategoryIcon icon={category.icon} color={category.color} size={17} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{category.name}</p>
                      {lineage.length > 0 && (
                        <p className="truncate text-xs text-gray-500">{lineage.join(' / ')}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1 rounded-lg border border-gray-700 bg-background p-1">
                    {(
                      [
                        ['PROTECTED', 'Protegida'],
                        ['MODERATE', 'Moderada'],
                        ['FLEXIBLE', 'Flexível']
                      ] as Array<[PersonalCategoryFlexibility, string]>
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        disabled={!canManage}
                        onClick={() => updatePreference(category.id, { flexibility: value })}
                        className={`rounded px-2 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          preference.flexibility === value
                            ? 'bg-accent text-white'
                            : 'text-gray-400 hover:bg-elevated hover:text-white'
                        }`}
                        aria-pressed={preference.flexibility === value}
                        aria-label={`${label}: ${category.name}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <CurrencyInput
                    label={`Mínimo para ${category.name}`}
                    value={preference.minimumMonthlyAmount}
                    disabled={!canManage}
                    onChange={(minimumMonthlyAmount) =>
                      updatePreference(category.id, { minimumMonthlyAmount })
                    }
                    className="mb-0"
                  />
                </div>
              );
            })}
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-700 p-4">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={draft.categoryPrioritiesReviewed}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  categoryPrioritiesReviewed: event.target.checked
                }))
              }
              className="mt-1 h-4 w-4 rounded border-gray-600 bg-background text-accent focus:ring-accent"
            />
            <span>
              <span className="block font-medium text-white">Revisei as prioridades das categorias</span>
              <span className="mt-1 block text-sm text-gray-400">
                Novas categorias adicionadas futuramente farão o perfil pedir uma nova revisão.
              </span>
            </span>
          </label>
        </Card>

        <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-700 bg-surface/95 p-4 shadow-xl backdrop-blur">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <ShieldCheck size={17} className="text-emerald-300" />
            Perfil compartilhado no workspace {response.workspace.name}
          </div>
          {canManage && (
            <Button type="submit" variant="accent" disabled={saving} className="inline-flex items-center gap-2">
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
              {saving ? 'Salvando...' : 'Salvar perfil'}
            </Button>
          )}
        </div>
        </fieldset>
      </form>
    </DashboardLayout>
  );
}

function FieldHelp({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <InfoModalButton
      size="compact"
      modalTitle={`Como preencher: ${label}`}
      buttonLabel={`Ajuda sobre ${label}`}
    >
      {children}
    </InfoModalButton>
  );
}

function ChoiceGroup({
  label,
  help,
  value,
  options,
  disabled = false,
  onChange
}: {
  label: string;
  help: React.ReactNode;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-300">
        <span aria-hidden="true">{label}</span>
        <FieldHelp label={label}>{help}</FieldHelp>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              value === option.value
                ? 'border-accent bg-accent/15 text-white'
                : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  help,
  disabled = false,
  onChange
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  help: React.ReactNode;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const inputId = React.useId();

  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-300">
        <label htmlFor={inputId}>{label}</label>
        <FieldHelp label={label}>{help}</FieldHelp>
      </div>
      <input
        id={inputId}
        type="number"
        min={min}
        max={max}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded border border-gray-700 bg-background px-3 py-2 text-white outline-none focus:border-accent focus:ring disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}

function SelectField({
  label,
  help,
  value,
  options,
  disabled = false,
  onChange
}: {
  label: string;
  help: React.ReactNode;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const selectId = React.useId();

  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-300">
        <label htmlFor={selectId}>{label}</label>
        <FieldHelp label={label}>{help}</FieldHelp>
      </div>
      <select
        id={selectId}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded border border-gray-700 bg-background px-3 py-2 text-white outline-none focus:border-accent focus:ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">Selecione...</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
