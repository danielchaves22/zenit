import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  FileStack,
  Plus,
  Save,
  Trash2,
  UploadCloud
} from 'lucide-react';

import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
import {
  buildInitialCalculationDefaults,
  CUSTOM_VERBA_FGTS_OPTIONS,
  CUSTOM_VERBA_GROUP_OPTIONS,
  CUSTOM_VERBA_STRATEGY_OPTIONS,
  FGTS_REGIME_OPTIONS,
  INITIAL_CALCULATION_SECTIONS,
  InitialCalculationFieldDefinition
} from './initial-calculation-fields';

type ProcessStatus = 'SOLICITACAO' | 'INICIAL' | 'CALCULO';
type ProcessOriginType = 'MANUAL' | 'IMPORT';
type FgtsRegime = 'FGTS_8' | 'FGTS_11_2';
type InitialCalculationStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
type CalculationVerbaStrategy =
  | 'MONTHLY_WITH_STANDARD_REFLEXES'
  | 'STANDARD_RESCISORY_BLOCK'
  | 'RESCISORY_NOTICE'
  | 'QUANTITY_X_HOURLY_RATE'
  | 'QUANTITY_X_DAILY_RATE'
  | 'MONTHS_X_REMUNERATION'
  | 'MONTHS_X_BASE_AMOUNT'
  | 'FIXED_AMOUNT'
  | 'CONDITIONAL_PENALTY_467'
  | 'CONDITIONAL_PENALTY_477';
type CalculationVerbaFgtsMode = 'REGIME' | 'FIXED_8' | 'NONE';
type CalculationLineType =
  | 'PRINCIPAL'
  | 'REFLEXO_13'
  | 'REFLEXO_FERIAS'
  | 'REFLEXO_AVISO'
  | 'REFLEXO_DSR'
  | 'FGTS'
  | 'MULTA'
  | 'TOTAL'
  | 'OUTRA';

type FormInputs = Record<string, string | boolean>;

interface ProcessSummary {
  id: number;
  status: ProcessStatus;
  originType: ProcessOriginType;
  requestingLawyerName: string | null;
  claimantName: string | null;
  notes: string | null;
}

interface CalculationGroupSummary {
  groupCode: string;
  groupLabel: string;
  total: number;
}

interface CalculationSummarySnapshot {
  fgtsRegime: FgtsRegime;
  fgtsRegimeRate: number;
  remuneration: number;
  honorariosPercentual: number;
  subtotalVerbas: number;
  totalHonorarios: number;
  totalGeral: number;
  totalFgts: number;
  totalMultas: number;
  groups: CalculationGroupSummary[];
}

interface CalculationLineSnapshot {
  id: number;
  lineType: CalculationLineType;
  label: string;
  amount: number;
  sortOrder: number;
  memoryJson?: Record<string, unknown> | null;
}

interface CalculationVersionVerbaSnapshot {
  id: number;
  verbaCode: string;
  verbaLabel: string;
  groupCode: string;
  groupLabel: string;
  strategy: CalculationVerbaStrategy;
  fgtsMode: CalculationVerbaFgtsMode;
  isEnabled: boolean;
  sortOrder: number;
  configJson?: Record<string, unknown> | null;
  inputSchemaJson?: Record<string, unknown> | null;
  linhasResultado: CalculationLineSnapshot[];
}

interface CalculationRuleSet {
  id: number;
  code: string;
  name: string;
}

interface InitialCalculationVersionDetail {
  id: number;
  versionNumber: number;
  fgtsRegime: FgtsRegime;
  inputSnapshotJson: Record<string, unknown>;
  summarySnapshotJson: CalculationSummarySnapshot | null;
  createdAt: string;
  publishedAt: string | null;
  ruleSet?: CalculationRuleSet | null;
  verbas: CalculationVersionVerbaSnapshot[];
}

interface InitialCalculationVersionSummary {
  id: number;
  versionNumber: number;
  fgtsRegime: FgtsRegime;
  createdAt: string;
  publishedAt: string | null;
  summarySnapshotJson: CalculationSummarySnapshot | null;
}

interface CalculationVerbaTemplate {
  id: number;
  code: string;
  label: string;
  groupCode: string;
  groupLabel: string;
  strategy: CalculationVerbaStrategy;
  fgtsMode: CalculationVerbaFgtsMode;
  sortOrder: number;
}

interface ProcessCustomVerba {
  id: number;
  code: string;
  label: string;
  groupCode: string;
  groupLabel: string;
  strategy: CalculationVerbaStrategy;
  fgtsMode: CalculationVerbaFgtsMode;
  sortOrder: number;
  configJson?: Record<string, unknown> | null;
  inputSchemaJson?: Record<string, unknown> | null;
}

interface InitialCalculationCatalog {
  ruleSet: CalculationRuleSet | null;
  verbasPadrao: CalculationVerbaTemplate[];
  verbasDoProcesso: ProcessCustomVerba[];
}

interface InitialCalculationContainer {
  id: number;
  status: InitialCalculationStatus;
  currentPublishedVersionId: number | null;
  currentPublishedVersion: InitialCalculationVersionDetail | null;
  latestVersion: InitialCalculationVersionDetail | null;
  versions: InitialCalculationVersionSummary[];
}

interface InitialCalculationResponse {
  process: ProcessSummary;
  calculation: InitialCalculationContainer | null;
  catalog: InitialCalculationCatalog;
}

interface CustomVerbaFormState {
  label: string;
  groupCode: string;
  strategy: 'FIXED_AMOUNT' | 'MONTHLY_WITH_STANDARD_REFLEXES';
  fgtsMode: CalculationVerbaFgtsMode;
  apply13: boolean;
  applyFerias: boolean;
  applyAviso: boolean;
  applyDsr: boolean;
}

interface InitialCalculationWorkspaceProps {
  processId: string;
}

const CUSTOM_VERBA_FORM_DEFAULTS: CustomVerbaFormState = {
  label: '',
  groupCode: 'INDENIZATORIAS',
  strategy: 'FIXED_AMOUNT',
  fgtsMode: 'NONE',
  apply13: true,
  applyFerias: true,
  applyAviso: true,
  applyDsr: false
};

function formatProcessStatus(status: ProcessStatus): string {
  if (status === 'SOLICITACAO') return 'Solicitacao';
  if (status === 'INICIAL') return 'Inicial';
  return 'Calculo';
}

function processStatusClass(status: ProcessStatus): string {
  if (status === 'SOLICITACAO') return 'bg-blue-100 text-blue-900 border border-blue-300';
  if (status === 'INICIAL') return 'bg-amber-100 text-amber-900 border border-amber-300';
  return 'bg-emerald-100 text-emerald-900 border border-emerald-300';
}

function formatOrigin(originType: ProcessOriginType): string {
  return originType === 'IMPORT' ? 'Importacao' : 'Manual';
}

function formatFgtsRegime(regime: FgtsRegime): string {
  return regime === 'FGTS_11_2' ? 'FGTS 11,2%' : 'FGTS 8%';
}

function formatStrategy(strategy: CalculationVerbaStrategy): string {
  if (strategy === 'FIXED_AMOUNT') return 'Valor fixo';
  if (strategy === 'MONTHLY_WITH_STANDARD_REFLEXES') return 'Mensal com reflexos';
  if (strategy === 'STANDARD_RESCISORY_BLOCK') return 'Bloco rescisorio';
  return strategy.replaceAll('_', ' ');
}

function formatFgtsMode(mode: CalculationVerbaFgtsMode): string {
  if (mode === 'REGIME') return 'FGTS do regime';
  if (mode === 'FIXED_8') return 'FGTS fixo 8%';
  return 'Sem FGTS';
}

function formatCurrency(value: number | string | null | undefined): string {
  const numeric = typeof value === 'string' ? Number(value) : value ?? 0;
  if (!Number.isFinite(numeric)) return 'R$ 0,00';

  return numeric.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function buildCustomVerbaInputKey(label: string): string {
  return `verba_custom_${slugify(label) || 'valor'}_valor`;
}

function normalizeInputValue(key: string, value: unknown, fieldMap: Map<string, InitialCalculationFieldDefinition>): string | boolean {
  const field = fieldMap.get(key);

  if (field?.type === 'boolean') {
    return value === true || value === 'true' || value === '1';
  }

  if (field?.type === 'date') {
    if (typeof value === 'string' && value.length >= 10) {
      return value.slice(0, 10);
    }
    return '';
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function buildFormInputs(
  version: InitialCalculationVersionDetail | null,
  customVerbas: ProcessCustomVerba[],
  fieldMap: Map<string, InitialCalculationFieldDefinition>
): FormInputs {
  const defaults = buildInitialCalculationDefaults();

  for (const verba of customVerbas) {
    const config = verba.configJson ?? {};
    const baseInputKey = typeof config.baseInputKey === 'string' ? config.baseInputKey : null;
    if (baseInputKey) {
      defaults[baseInputKey] = '';
    }
  }

  if (!version) {
    return defaults;
  }

  const merged: FormInputs = { ...defaults };
  for (const [key, rawValue] of Object.entries(version.inputSnapshotJson || {})) {
    if (key === 'remuneracaoCalculada') continue;
    merged[key] = normalizeInputValue(key, rawValue, fieldMap);
  }

  return merged;
}

function getDisabledVerbaCodes(version: InitialCalculationVersionDetail | null): string[] {
  if (!version) return [];

  return version.verbas.filter((verba) => !verba.isEnabled).map((verba) => verba.verbaCode);
}

function getCurrentVersion(
  calculation: InitialCalculationContainer | null,
  versionHistory: InitialCalculationVersionDetail[]
): InitialCalculationVersionDetail | null {
  if (versionHistory.length) return versionHistory[0];
  return calculation?.latestVersion || calculation?.currentPublishedVersion || null;
}

function resolveCustomVerbaValueInput(verba: ProcessCustomVerba): string | null {
  const config = verba.configJson ?? {};
  const baseInputKey = config.baseInputKey;
  return typeof baseInputKey === 'string' ? baseInputKey : null;
}

function groupVerbas<T extends { groupCode: string; groupLabel: string; sortOrder?: number }>(items: T[]): Array<{
  groupCode: string;
  groupLabel: string;
  items: T[];
}> {
  const groups = new Map<string, { groupCode: string; groupLabel: string; items: T[] }>();

  for (const item of items) {
    const existing = groups.get(item.groupCode);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(item.groupCode, {
        groupCode: item.groupCode,
        groupLabel: item.groupLabel,
        items: [item]
      });
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    }))
    .sort((left, right) => left.groupLabel.localeCompare(right.groupLabel));
}

export function InitialCalculationWorkspace({ processId }: InitialCalculationWorkspaceProps) {
  const router = useRouter();
  const { addToast } = useToast();

  const fieldMap = useMemo(() => {
    const map = new Map<string, InitialCalculationFieldDefinition>();
    for (const section of INITIAL_CALCULATION_SECTIONS) {
      for (const field of section.fields) {
        map.set(field.key, field);
      }
    }
    return map;
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [versionActionId, setVersionActionId] = useState<number | null>(null);
  const [customVerbaLoading, setCustomVerbaLoading] = useState(false);
  const [processSummary, setProcessSummary] = useState<ProcessSummary | null>(null);
  const [calculation, setCalculation] = useState<InitialCalculationContainer | null>(null);
  const [catalog, setCatalog] = useState<InitialCalculationCatalog | null>(null);
  const [versionHistory, setVersionHistory] = useState<InitialCalculationVersionDetail[]>([]);
  const [fgtsRegime, setFgtsRegime] = useState<FgtsRegime>('FGTS_8');
  const [formInputs, setFormInputs] = useState<FormInputs>(buildInitialCalculationDefaults());
  const [disabledVerbaCodes, setDisabledVerbaCodes] = useState<string[]>([]);
  const [customVerbaForm, setCustomVerbaForm] = useState<CustomVerbaFormState>(CUSTOM_VERBA_FORM_DEFAULTS);

  const currentVersion = useMemo(
    () => getCurrentVersion(calculation, versionHistory),
    [calculation, versionHistory]
  );

  const allVerbas = useMemo(() => {
    if (!catalog) return [];
    return [...catalog.verbasPadrao, ...catalog.verbasDoProcesso];
  }, [catalog]);

  const groupedVerbas = useMemo(() => groupVerbas(allVerbas), [allVerbas]);
  const customVerbaGroups = useMemo(
    () => (catalog ? groupVerbas(catalog.verbasDoProcesso) : []),
    [catalog]
  );

  useEffect(() => {
    if (!processId) return;
    void loadCalculation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processId]);

  async function loadCalculation() {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get<InitialCalculationResponse>(`/processes/${processId}/initial-calculation`);
      const payload = response.data;
      setProcessSummary(payload.process);
      setCalculation(payload.calculation);
      setCatalog(payload.catalog);

      const activeVersion = payload.calculation?.latestVersion || payload.calculation?.currentPublishedVersion || null;
      setFgtsRegime(activeVersion?.fgtsRegime || 'FGTS_8');
      setFormInputs(buildFormInputs(activeVersion, payload.catalog.verbasDoProcesso || [], fieldMap));
      setDisabledVerbaCodes(getDisabledVerbaCodes(activeVersion));

      if (payload.calculation?.id) {
        const versionsResponse = await api.get<InitialCalculationVersionDetail[]>(
          `/processes/${processId}/initial-calculations/${payload.calculation.id}/versions`
        );
        setVersionHistory(versionsResponse.data || []);
      } else {
        setVersionHistory([]);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar calculo inicial.');
    } finally {
      setLoading(false);
    }
  }

  function updateInputValue(key: string, value: string | boolean) {
    setFormInputs((prev) => ({
      ...prev,
      [key]: value
    }));
  }

  function toggleVerba(code: string) {
    setDisabledVerbaCodes((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code]
    );
  }

  function serializeInputs(): Record<string, unknown> {
    return Object.entries(formInputs).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
      accumulator[key] = value;
      return accumulator;
    }, {});
  }

  async function persistVersion(publish: boolean) {
    try {
      setSaving(publish ? 'publish' : 'draft');

      const payload = {
        fgtsRegime,
        inputs: serializeInputs(),
        publish,
        disabledVerbaCodes
      };

      if (calculation?.id) {
        await api.post(`/processes/${processId}/initial-calculations/${calculation.id}/versions`, payload);
      } else {
        await api.post(`/processes/${processId}/initial-calculations`, payload);
      }

      addToast(
        publish ? 'Calculo inicial publicado com sucesso.' : 'Rascunho salvo com sucesso.',
        'success'
      );
      await loadCalculation();
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar calculo inicial.', 'error');
    } finally {
      setSaving(null);
    }
  }

  async function handlePublishVersion(versionId: number) {
    if (!calculation?.id) return;

    try {
      setVersionActionId(versionId);
      await api.patch(
        `/processes/${processId}/initial-calculations/${calculation.id}/versions/${versionId}/publish`
      );
      addToast('Versao publicada com sucesso.', 'success');
      await loadCalculation();
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao publicar versao.', 'error');
    } finally {
      setVersionActionId(null);
    }
  }

  function applyVersionAsBase(version: InitialCalculationVersionDetail) {
    setFgtsRegime(version.fgtsRegime);
    setFormInputs(buildFormInputs(version, catalog?.verbasDoProcesso || [], fieldMap));
    setDisabledVerbaCodes(getDisabledVerbaCodes(version));
    addToast(`Versao ${version.versionNumber} carregada no formulario.`, 'success');
  }

  async function handleCreateCustomVerba() {
    if (!customVerbaForm.label.trim()) {
      addToast('Informe o nome da verba customizada.', 'error');
      return;
    }

    const group = CUSTOM_VERBA_GROUP_OPTIONS.find((option) => option.value === customVerbaForm.groupCode);
    if (!group) {
      addToast('Grupo da verba invalido.', 'error');
      return;
    }

    const baseInputKey = buildCustomVerbaInputKey(customVerbaForm.label);
    const configJson =
      customVerbaForm.strategy === 'FIXED_AMOUNT'
        ? {
            baseInputKey
          }
        : {
            baseInputKey,
            multiplierInputKey: 'meses',
            apply13: customVerbaForm.apply13,
            applyFerias: customVerbaForm.applyFerias,
            applyAviso: customVerbaForm.applyAviso,
            applyDsr: customVerbaForm.applyDsr
          };

    const inputSchemaJson =
      customVerbaForm.strategy === 'FIXED_AMOUNT'
        ? {
            requiredInputs: [baseInputKey]
          }
        : {
            requiredInputs: [baseInputKey, 'meses']
          };

    try {
      setCustomVerbaLoading(true);
      await api.post(`/processes/${processId}/initial-calculation/verbas-do-processo`, {
        label: customVerbaForm.label,
        groupCode: group.value,
        groupLabel: group.label,
        strategy: customVerbaForm.strategy,
        fgtsMode: customVerbaForm.fgtsMode,
        configJson,
        inputSchemaJson,
        sortOrder: Date.now() % 100000
      });

      setCustomVerbaForm(CUSTOM_VERBA_FORM_DEFAULTS);
      setFormInputs((prev) => ({
        ...prev,
        [baseInputKey]: ''
      }));
      addToast('Verba customizada criada com sucesso.', 'success');
      await loadCalculation();
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao criar verba customizada.', 'error');
    } finally {
      setCustomVerbaLoading(false);
    }
  }

  async function handleDeleteCustomVerba(verbaId: number) {
    try {
      setCustomVerbaLoading(true);
      await api.delete(`/processes/${processId}/initial-calculation/verbas-do-processo/${verbaId}`);
      addToast('Verba customizada removida.', 'success');
      await loadCalculation();
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao remover verba customizada.', 'error');
    } finally {
      setCustomVerbaLoading(false);
    }
  }

  function renderField(field: InitialCalculationFieldDefinition) {
    const value = formInputs[field.key];

    if (field.type === 'currency') {
      return (
        <CurrencyInput
          key={field.key}
          id={field.key}
          label={field.label}
          value={typeof value === 'boolean' ? '' : value || ''}
          onChange={(nextValue) => updateInputValue(field.key, nextValue)}
          placeholder={field.placeholder}
        />
      );
    }

    if (field.type === 'boolean') {
      return (
        <div key={field.key} className="flex items-center gap-3 rounded border border-soft bg-elevated px-3 py-3">
          <input
            id={field.key}
            type="checkbox"
            checked={value === true}
            onChange={(event) => updateInputValue(field.key, event.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-background text-accent focus:ring-accent"
          />
          <label htmlFor={field.key} className="text-sm text-gray-200">
            {field.label}
          </label>
        </div>
      );
    }

    if (field.type === 'select') {
      return (
        <Select
          key={field.key}
          id={field.key}
          label={field.label}
          value={typeof value === 'boolean' ? '' : value || ''}
          onChange={(event) => updateInputValue(field.key, event.target.value)}
          options={field.options || []}
          className="w-full"
        />
      );
    }

    if (field.type === 'textarea') {
      return (
        <div key={field.key}>
          <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor={field.key}>
            {field.label}
          </label>
          <textarea
            id={field.key}
            rows={4}
            value={typeof value === 'boolean' ? '' : value || ''}
            onChange={(event) => updateInputValue(field.key, event.target.value)}
            placeholder={field.placeholder}
            className="w-full rounded border border-gray-700 bg-background px-3 py-2 text-white focus:border-[#2563eb] focus:outline-none focus:ring"
          />
          {field.description && <p className="mt-1 text-xs text-gray-400">{field.description}</p>}
        </div>
      );
    }

    return (
      <div key={field.key}>
        <Input
          id={field.key}
          type={field.type === 'date' ? 'date' : 'number'}
          label={field.label}
          value={typeof value === 'boolean' ? '' : value || ''}
          onChange={(event) => updateInputValue(field.key, event.target.value)}
          placeholder={field.placeholder}
          min={field.min}
          step={field.step}
          className="mb-0"
        />
        {field.description && <p className="mt-1 text-xs text-gray-400">{field.description}</p>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full rounded bg-elevated" />
        <Skeleton className="h-64 w-full rounded bg-elevated" />
        <Skeleton className="h-64 w-full rounded bg-elevated" />
      </div>
    );
  }

  if (error || !processSummary || !catalog) {
    return (
      <Card>
        <div className="py-10 text-center">
          <p className="mb-4 text-red-400">{error || 'Processo nao encontrado.'}</p>
          <Button variant="outline" onClick={() => router.push('/processes')}>
            Voltar para processos
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-soft bg-surface p-6 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-soft bg-elevated px-3 py-1 text-xs font-medium text-gray-200">
              <Calculator size={14} />
              Calculo Inicial
            </span>
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${processStatusClass(processSummary.status)}`}>
              {formatProcessStatus(processSummary.status)}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200">
              {formatOrigin(processSummary.originType)}
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white">
            Processo #{processSummary.id}
          </h1>
          <p className="mt-2 text-sm text-gray-300">
            {processSummary.claimantName || 'Reclamante nao informado'}
            {' · '}
            {processSummary.requestingLawyerName || 'Advogado nao informado'}
          </p>
          {processSummary.notes && <p className="mt-2 max-w-3xl text-sm text-gray-400">{processSummary.notes}</p>}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => router.push(`/processes/${processSummary.id}`)} className="flex items-center gap-2">
            <ArrowLeft size={16} />
            Voltar ao processo
          </Button>
          <Button
            variant="outline"
            onClick={() => void persistVersion(false)}
            disabled={saving !== null}
            className="flex items-center gap-2"
          >
            <Save size={16} />
            {saving === 'draft' ? 'Salvando...' : 'Salvar rascunho'}
          </Button>
          <Button
            variant="accent"
            onClick={() => void persistVersion(true)}
            disabled={saving !== null}
            className="flex items-center gap-2"
          >
            <UploadCloud size={16} />
            {saving === 'publish' ? 'Publicando...' : 'Publicar'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Select
                id="fgtsRegime"
                label="Regime de FGTS"
                value={fgtsRegime}
                onChange={(event) => setFgtsRegime(event.target.value as FgtsRegime)}
                options={FGTS_REGIME_OPTIONS}
                className="w-full"
              />
              <div className="rounded border border-soft bg-elevated px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">Regra ativa</p>
                <p className="mt-1 text-sm text-white">
                  {catalog.ruleSet?.name || 'Calculo Inicial v1'}
                </p>
              </div>
            </div>
          </Card>

          {INITIAL_CALCULATION_SECTIONS.map((section) => {
            const gridClass =
              section.columns === 3
                ? 'grid-cols-1 md:grid-cols-3'
                : section.columns === 1
                  ? 'grid-cols-1'
                  : 'grid-cols-1 md:grid-cols-2';

            return (
              <Card key={section.key}>
                <div className="mb-5">
                  <h2 className="text-lg font-medium text-white">{section.title}</h2>
                  {section.description && <p className="mt-1 text-sm text-gray-400">{section.description}</p>}
                </div>
                <div className={`grid gap-4 ${gridClass}`}>
                  {section.fields.map((field) => renderField(field))}
                </div>
              </Card>
            );
          })}

          <Card>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-white">Verbas ativas</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Desmarque verbas que nao devem participar da versao atual.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {groupedVerbas.map((group) => (
                <div key={group.groupCode} className="rounded-xl border border-soft bg-elevated/40 p-4">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-300">
                    {group.groupLabel}
                  </h3>
                  <div className="grid gap-2 md:grid-cols-2">
                    {group.items.map((verba) => {
                      const isEnabled = !disabledVerbaCodes.includes(verba.code);
                      return (
                        <label
                          key={verba.code}
                          className="flex items-start gap-3 rounded border border-soft bg-background px-3 py-2 text-sm text-gray-200"
                        >
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={() => toggleVerba(verba.code)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-background text-accent focus:ring-accent"
                          />
                          <span>
                            <span className="block">{verba.label}</span>
                            <span className="mt-1 block text-xs text-gray-400">
                              {formatStrategy(verba.strategy)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-white">Verbas customizadas do processo</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Adicione verbas que so existem neste processo.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Nome da verba"
                value={customVerbaForm.label}
                onChange={(event) =>
                  setCustomVerbaForm((prev) => ({ ...prev, label: event.target.value }))
                }
                placeholder="Ex: Ajuda de combustivel"
              />
              <Select
                label="Grupo"
                value={customVerbaForm.groupCode}
                onChange={(event) =>
                  setCustomVerbaForm((prev) => ({
                    ...prev,
                    groupCode: event.target.value
                  }))
                }
                options={CUSTOM_VERBA_GROUP_OPTIONS}
                className="w-full"
              />
              <Select
                label="Tipo de calculo"
                value={customVerbaForm.strategy}
                onChange={(event) =>
                  setCustomVerbaForm((prev) => ({
                    ...prev,
                    strategy: event.target.value as CustomVerbaFormState['strategy']
                  }))
                }
                options={CUSTOM_VERBA_STRATEGY_OPTIONS}
                className="w-full"
              />
              <Select
                label="Incidencia de FGTS"
                value={customVerbaForm.fgtsMode}
                onChange={(event) =>
                  setCustomVerbaForm((prev) => ({
                    ...prev,
                    fgtsMode: event.target.value as CalculationVerbaFgtsMode
                  }))
                }
                options={CUSTOM_VERBA_FGTS_OPTIONS}
                className="w-full"
              />
            </div>

            {customVerbaForm.strategy === 'MONTHLY_WITH_STANDARD_REFLEXES' && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded border border-soft bg-elevated px-3 py-3 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={customVerbaForm.apply13}
                    onChange={(event) =>
                      setCustomVerbaForm((prev) => ({ ...prev, apply13: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-600 bg-background text-accent focus:ring-accent"
                  />
                  Reflexo em 13
                </label>
                <label className="flex items-center gap-3 rounded border border-soft bg-elevated px-3 py-3 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={customVerbaForm.applyFerias}
                    onChange={(event) =>
                      setCustomVerbaForm((prev) => ({ ...prev, applyFerias: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-600 bg-background text-accent focus:ring-accent"
                  />
                  Reflexo em ferias
                </label>
                <label className="flex items-center gap-3 rounded border border-soft bg-elevated px-3 py-3 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={customVerbaForm.applyAviso}
                    onChange={(event) =>
                      setCustomVerbaForm((prev) => ({ ...prev, applyAviso: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-600 bg-background text-accent focus:ring-accent"
                  />
                  Reflexo em aviso
                </label>
                <label className="flex items-center gap-3 rounded border border-soft bg-elevated px-3 py-3 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={customVerbaForm.applyDsr}
                    onChange={(event) =>
                      setCustomVerbaForm((prev) => ({ ...prev, applyDsr: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-600 bg-background text-accent focus:ring-accent"
                  />
                  Reflexo em DSR
                </label>
              </div>
            )}

            <div className="mt-4">
              <Button
                variant="accent"
                onClick={() => void handleCreateCustomVerba()}
                disabled={customVerbaLoading}
                className="flex items-center gap-2"
              >
                <Plus size={16} />
                {customVerbaLoading ? 'Salvando...' : 'Adicionar verba customizada'}
              </Button>
            </div>

            {catalog.verbasDoProcesso.length > 0 && (
              <div className="mt-6 space-y-4">
                {customVerbaGroups.map((group) => (
                  <div key={group.groupCode} className="rounded-xl border border-soft bg-elevated/40 p-4">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-300">
                      {group.groupLabel}
                    </h3>
                    <div className="space-y-3">
                      {group.items.map((verba) => {
                        const valueInputKey = resolveCustomVerbaValueInput(verba);
                        return (
                          <div key={verba.id} className="rounded border border-soft bg-background p-4">
                            <div className="mb-3 flex items-start justify-between gap-4">
                              <div>
                                <p className="font-medium text-white">{verba.label}</p>
                                <p className="mt-1 text-xs text-gray-400">
                                  {formatStrategy(verba.strategy)} · {formatFgtsMode(verba.fgtsMode)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleDeleteCustomVerba(verba.id)}
                                className="text-gray-400 transition-colors hover:text-red-400"
                                title="Remover verba customizada"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>

                            {valueInputKey && (
                              <CurrencyInput
                                id={valueInputKey}
                                label={
                                  verba.strategy === 'MONTHLY_WITH_STANDARD_REFLEXES'
                                    ? `${verba.label} - valor mensal`
                                    : verba.label
                                }
                                value={
                                  typeof formInputs[valueInputKey] === 'boolean'
                                    ? ''
                                    : formInputs[valueInputKey] || ''
                                }
                                onChange={(nextValue) => updateInputValue(valueInputKey, nextValue)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-5 flex items-center gap-3">
              <FileStack size={18} className="text-accent" />
              <div>
                <h2 className="text-lg font-medium text-white">Resultado detalhado</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Baseado na ultima versao calculada.
                </p>
              </div>
            </div>

            {!currentVersion ? (
              <p className="text-sm text-gray-400">
                Nenhuma versao calculada ainda. Preencha o formulario e salve um rascunho para ver o detalhamento.
              </p>
            ) : (
              <div className="space-y-4">
                {groupVerbas(currentVersion.verbas).map((group) => (
                  <div key={group.groupCode} className="rounded-xl border border-soft bg-elevated/40 p-4">
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
                          {group.groupLabel}
                        </h3>
                        <p className="mt-1 text-xs text-gray-400">
                          {group.items.length} verba(s) nesta secao
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {group.items.map((verba) => (
                        <div key={verba.id} className="rounded border border-soft bg-background p-4">
                          <div className="mb-3 flex items-center justify-between gap-4">
                            <div>
                              <p className="font-medium text-white">{verba.verbaLabel}</p>
                              {!verba.isEnabled && (
                                <p className="mt-1 text-xs text-amber-300">Verba desabilitada nesta versao.</p>
                              )}
                            </div>
                            <span className="text-sm font-semibold text-accent">
                              {formatCurrency(
                                verba.linhasResultado.find((line) => line.lineType === 'TOTAL')?.amount || 0
                              )}
                            </span>
                          </div>

                          <div className="space-y-2">
                            {verba.linhasResultado.map((line) => (
                              <div key={line.id} className="flex items-center justify-between gap-4 text-sm">
                                <span className={line.lineType === 'TOTAL' ? 'font-semibold text-white' : 'text-gray-300'}>
                                  {line.label}
                                </span>
                                <span className={line.lineType === 'TOTAL' ? 'font-semibold text-white' : 'text-gray-400'}>
                                  {formatCurrency(line.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <div className="mb-4 flex items-center gap-3">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <div>
                <h2 className="text-lg font-medium text-white">Resumo da ultima versao</h2>
                <p className="mt-1 text-sm text-gray-400">
                  {currentVersion
                    ? `Versao ${currentVersion.versionNumber} · ${formatFgtsRegime(currentVersion.fgtsRegime)}`
                    : 'Sem versao calculada'}
                </p>
              </div>
            </div>

            {!currentVersion?.summarySnapshotJson ? (
              <p className="text-sm text-gray-400">Salve o calculo para exibir o resumo financeiro.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border border-soft bg-elevated px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-gray-400">Remuneracao</p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {formatCurrency(currentVersion.summarySnapshotJson.remuneration)}
                    </p>
                  </div>
                  <div className="rounded border border-soft bg-elevated px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-gray-400">FGTS</p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {formatCurrency(currentVersion.summarySnapshotJson.totalFgts)}
                    </p>
                  </div>
                  <div className="rounded border border-soft bg-elevated px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-gray-400">Subtotal</p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {formatCurrency(currentVersion.summarySnapshotJson.subtotalVerbas)}
                    </p>
                  </div>
                  <div className="rounded border border-soft bg-elevated px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-gray-400">Honorarios</p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {formatCurrency(currentVersion.summarySnapshotJson.totalHonorarios)}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-700/50 bg-emerald-950/30 px-4 py-4">
                  <p className="text-xs uppercase tracking-wide text-emerald-300">Valor devido</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {formatCurrency(currentVersion.summarySnapshotJson.totalGeral)}
                  </p>
                </div>

                <div className="space-y-2">
                  {currentVersion.summarySnapshotJson.groups.map((group) => (
                    <div key={group.groupCode} className="flex items-center justify-between gap-4 rounded border border-soft bg-background px-3 py-2 text-sm">
                      <span className="text-gray-300">{group.groupLabel}</span>
                      <span className="font-medium text-white">{formatCurrency(group.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-4">
              <h2 className="text-lg font-medium text-white">Historico de versoes</h2>
              <p className="mt-1 text-sm text-gray-400">
                Reaproveite versoes anteriores ou publique uma revisao.
              </p>
            </div>

            {versionHistory.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma versao criada ate o momento.</p>
            ) : (
              <div className="space-y-3">
                {versionHistory.map((version) => {
                  const isPublished = calculation?.currentPublishedVersionId === version.id;
                  return (
                    <div key={version.id} className="rounded-xl border border-soft bg-elevated/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-white">Versao {version.versionNumber}</p>
                          <p className="mt-1 text-xs text-gray-400">
                            Criada em {formatDateTime(version.createdAt)}
                          </p>
                          <p className="mt-1 text-xs text-gray-400">
                            {formatFgtsRegime(version.fgtsRegime)}
                          </p>
                        </div>
                        {isPublished && (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-900">
                            Publicada
                          </span>
                        )}
                      </div>

                      <div className="mt-3">
                        <p className="text-xs uppercase tracking-wide text-gray-400">Total geral</p>
                        <p className="mt-1 text-sm font-semibold text-white">
                          {formatCurrency(version.summarySnapshotJson?.totalGeral || 0)}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => applyVersionAsBase(version)}
                          className="text-xs"
                        >
                          Usar como base
                        </Button>
                        {!isPublished && (
                          <Button
                            variant="accent"
                            onClick={() => void handlePublishVersion(version.id)}
                            disabled={versionActionId !== null}
                            className="text-xs"
                          >
                            {versionActionId === version.id ? 'Publicando...' : 'Publicar versao'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default InitialCalculationWorkspace;
