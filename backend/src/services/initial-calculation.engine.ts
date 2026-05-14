import {
  CalculationLineType,
  CalculationVerbaFgtsMode,
  CalculationVerbaStrategy,
  CalculationVersionVerbaSource,
  FgtsRegime
} from '@prisma/client';

export type InitialCalculationInputs = Record<string, unknown>;
type JsonObject = Record<string, unknown>;

export interface CalculationVerbaSeed {
  sourceType: CalculationVersionVerbaSource;
  templateId?: number | null;
  processCustomVerbaId?: number | null;
  verbaCode: string;
  verbaLabel: string;
  groupCode: string;
  groupLabel: string;
  strategy: CalculationVerbaStrategy;
  fgtsMode: CalculationVerbaFgtsMode;
  configJson?: Record<string, unknown> | null;
  inputSchemaJson?: Record<string, unknown> | null;
  isEnabled: boolean;
  sortOrder: number;
}

export interface CalculationLineResult {
  lineType: CalculationLineType;
  label: string;
  amount: number;
  sortOrder: number;
  memoryJson?: JsonObject | null;
}

export interface CalculationVerbaResult extends CalculationVerbaSeed {
  lines: CalculationLineResult[];
  totalAmount: number;
}

export interface CalculationGroupSummary {
  groupCode: string;
  groupLabel: string;
  total: number;
}

export interface CalculationSummary {
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

export interface InitialCalculationEngineResult {
  inputSnapshot: InitialCalculationInputs;
  summary: CalculationSummary;
  verbas: CalculationVerbaResult[];
}

interface EngineHelpers {
  months: number;
  salarioBase: number;
  salarioMinimo: number;
  remuneracao: number;
  cargaMensal: number;
  valorDia: number;
  valorHora: number;
  diasAvisoPrevio: number;
  fgtsRegimeRate: number;
  fgtsPenaltyBaseRate: number;
}

interface CalculationState {
  totalRescisorias: number;
}

const FGTS_FIXED_8_RATE = 0.08;

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as JsonObject;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;

    let normalized = trimmed;

    if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(trimmed)) {
      normalized = trimmed.replace(/\./g, '').replace(',', '.');
    } else if (trimmed.includes(',') && !trimmed.includes('.')) {
      normalized = trimmed.replace(',', '.');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'sim', 'yes', 'y', 'on'].includes(normalized);
  }

  if (typeof value === 'number') return value !== 0;
  return false;
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value) > 1) return value / 100;
  return value;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getInputNumber(inputs: InitialCalculationInputs, key?: string): number {
  if (!key) return 0;
  return toNumber(inputs[key]);
}

function getInputBoolean(inputs: InitialCalculationInputs, key?: string): boolean {
  if (!key) return false;
  return toBoolean(inputs[key]);
}

function getConfigString(config: JsonObject, key: string): string | undefined {
  const value = config[key];
  return typeof value === 'string' && value.trim().length ? value.trim() : undefined;
}

function getConfigBoolean(config: JsonObject, key: string, fallback = false): boolean {
  const value = config[key];
  if (value === undefined) return fallback;
  return toBoolean(value);
}

function getFgtsRate(fgtsRegime: FgtsRegime): number {
  return fgtsRegime === 'FGTS_11_2' ? 0.112 : 0.08;
}

function getVerbaFgtsRate(mode: CalculationVerbaFgtsMode, helpers: EngineHelpers): number {
  if (mode === 'REGIME') return helpers.fgtsRegimeRate;
  if (mode === 'FIXED_8') return FGTS_FIXED_8_RATE;
  return 0;
}

function getPericulosidadeRate(inputs: InitialCalculationInputs): number {
  return normalizePercent(getInputNumber(inputs, 'periculosidadeGrau') || 0.3);
}

function getInsalubridadeRate(inputs: InitialCalculationInputs): number {
  return normalizePercent(getInputNumber(inputs, 'insalubridadeGrau'));
}

function calculateDerivedRemuneracao(inputs: InitialCalculationInputs): number {
  const salarioBase = getInputNumber(inputs, 'salarioBase');
  const salarioMinimo = getInputNumber(inputs, 'salarioMinimo');
  const periculosidadeBase = salarioBase * getPericulosidadeRate(inputs);
  const insalubridadeBase = salarioMinimo * getInsalubridadeRate(inputs);

  return roundCurrency(
    salarioBase +
      getInputNumber(inputs, 'valeAlimentacaoIntegracao') +
      getInputNumber(inputs, 'salarioExtrafolha') +
      getInputNumber(inputs, 'equiparacaoSalarial') +
      getInputNumber(inputs, 'acumuloFuncao') +
      getInputNumber(inputs, 'diferencaSalarial') +
      periculosidadeBase +
      insalubridadeBase +
      getInputNumber(inputs, 'comissaoIntegracao') +
      getInputNumber(inputs, 'gorjetasIntegracao') +
      getInputNumber(inputs, 'gratificacoesIntegracao')
  );
}

function buildHelpers(inputs: InitialCalculationInputs, fgtsRegime: FgtsRegime): EngineHelpers {
  const months = getInputNumber(inputs, 'meses');
  const salarioBase = getInputNumber(inputs, 'salarioBase');
  const salarioMinimo = getInputNumber(inputs, 'salarioMinimo');
  const cargaMensal = getInputNumber(inputs, 'cargaMensal') || 220;
  const remuneracaoInformada = getInputNumber(inputs, 'remuneracao');
  const remuneracao = remuneracaoInformada > 0 ? remuneracaoInformada : calculateDerivedRemuneracao(inputs);
  const valorDia = remuneracao > 0 ? remuneracao / 30 : 0;
  const valorHora = cargaMensal > 0 ? remuneracao / cargaMensal : 0;

  return {
    months,
    salarioBase,
    salarioMinimo,
    remuneracao: roundCurrency(remuneracao),
    cargaMensal,
    valorDia: roundCurrency(valorDia),
    valorHora: roundCurrency(valorHora),
    diasAvisoPrevio: getInputNumber(inputs, 'diasAvisoPrevio'),
    fgtsRegimeRate: getFgtsRate(fgtsRegime),
    fgtsPenaltyBaseRate: FGTS_FIXED_8_RATE
  };
}

function createLine(
  lineType: CalculationLineType,
  label: string,
  amount: number,
  sortOrder: number,
  memoryJson?: JsonObject | null
): CalculationLineResult {
  return {
    lineType,
    label,
    amount: roundCurrency(amount),
    sortOrder,
    memoryJson: memoryJson ?? null
  };
}

function createTotalLine(amount: number, sortOrder: number): CalculationLineResult {
  return createLine('TOTAL', 'Total', amount, sortOrder);
}

function resolveBaseAmount(
  baseMode: string | undefined,
  config: JsonObject,
  inputs: InitialCalculationInputs,
  helpers: EngineHelpers
): number {
  switch (baseMode) {
    case 'REMUNERACAO':
      return helpers.remuneracao;
    case 'SALARIO_BASE':
      return helpers.salarioBase;
    case 'SALARIO_MINIMO':
      return helpers.salarioMinimo;
    case 'PERICULOSIDADE':
      return helpers.salarioBase * getPericulosidadeRate(inputs);
    case 'INSALUBRIDADE':
      return helpers.salarioMinimo * getInsalubridadeRate(inputs);
    default:
      return getInputNumber(inputs, getConfigString(config, 'baseInputKey'));
  }
}

function calculateStandardReflexes(params: {
  principal: number;
  periodBase: number;
  fgtsMode: CalculationVerbaFgtsMode;
  helpers: EngineHelpers;
  apply13?: boolean;
  applyFerias?: boolean;
  applyAviso?: boolean;
  applyDsr?: boolean;
  verbaLabel: string;
}): CalculationLineResult[] {
  const {
    principal,
    periodBase,
    fgtsMode,
    helpers,
    apply13 = true,
    applyFerias = true,
    applyAviso = true,
    applyDsr = false,
    verbaLabel
  } = params;

  const reflex13 = apply13 ? principal / 12 : 0;
  const reflexFerias = applyFerias ? (principal / 12) * (4 / 3) : 0;
  const reflexAviso = applyAviso ? periodBase * (helpers.diasAvisoPrevio / 30) : 0;
  const reflexDsr = applyDsr ? getInputNumber({ dsrPercentual: 0 }, 'dsrPercentual') * principal : 0;
  const fgtsBase = principal + reflex13 + reflexFerias + reflexAviso + reflexDsr;
  const fgts = fgtsBase * getVerbaFgtsRate(fgtsMode, helpers);

  return [
    createLine('PRINCIPAL', `${verbaLabel} - Principal`, principal, 10),
    createLine('REFLEXO_13', `${verbaLabel} - Reflexo 13`, reflex13, 20),
    createLine('REFLEXO_FERIAS', `${verbaLabel} - Reflexo Ferias`, reflexFerias, 30),
    createLine('REFLEXO_AVISO', `${verbaLabel} - Reflexo Aviso`, reflexAviso, 40),
    createLine('REFLEXO_DSR', `${verbaLabel} - Reflexo DSR`, reflexDsr, 50),
    createLine('FGTS', `${verbaLabel} - FGTS`, fgts, 60)
  ].filter((line) => line.amount !== 0);
}

function calculateStandardRescisoryBlock(
  verba: CalculationVerbaSeed,
  inputs: InitialCalculationInputs,
  helpers: EngineHelpers
): CalculationLineResult[] {
  const avisoPrevio = helpers.valorDia * getInputNumber(inputs, 'diasAvisoPrevio') - getInputNumber(inputs, 'avisoPrevioRecebido');
  const decimoTerceiroAviso =
    (helpers.remuneracao / 12) * getInputNumber(inputs, 'avos13SobreAviso') -
    getInputNumber(inputs, 'valor13SobreAvisoRecebido');
  const feriasAviso =
    ((helpers.remuneracao / 12) * getInputNumber(inputs, 'avosFeriasSobreAviso') * 4) / 3 -
    getInputNumber(inputs, 'valorFeriasSobreAvisoRecebido');
  const decimoTerceiroRescisorio =
    (helpers.remuneracao / 12) * getInputNumber(inputs, 'avos13Rescisorio') -
    getInputNumber(inputs, 'valor13RescisorioRecebido');
  const feriasRescisorias =
    ((helpers.remuneracao / 12) * getInputNumber(inputs, 'avosFeriasRescisorio') * 4) / 3 -
    getInputNumber(inputs, 'valorFeriasRescisorioRecebido');
  const saldoSalario =
    helpers.valorDia * getInputNumber(inputs, 'diasSaldoSalario') - getInputNumber(inputs, 'valorSaldoSalarioRecebido');

  const fgtsBase =
    avisoPrevio +
    decimoTerceiroAviso +
    feriasAviso +
    decimoTerceiroRescisorio +
    feriasRescisorias +
    saldoSalario;
  const fgts = fgtsBase * helpers.fgtsRegimeRate;
  const multa40 =
    helpers.remuneracao *
    getInputNumber(inputs, 'mesesFgtsDevidosParaMulta40') *
    helpers.fgtsPenaltyBaseRate *
    0.4;

  return [
    createLine('PRINCIPAL', 'Aviso Previo', avisoPrevio, 10, {
      formula: 'valorDia x diasAvisoPrevio - avisoPrevioRecebido'
    }),
    createLine('REFLEXO_13', '13 sobre Aviso', decimoTerceiroAviso, 20),
    createLine('REFLEXO_FERIAS', 'Ferias sobre Aviso', feriasAviso, 30),
    createLine('REFLEXO_13', '13 Proporcional', decimoTerceiroRescisorio, 40),
    createLine('REFLEXO_FERIAS', 'Ferias Proporcionais', feriasRescisorias, 50),
    createLine('PRINCIPAL', 'Saldo de Salario', saldoSalario, 60),
    createLine('FGTS', 'FGTS sobre Verbas Rescisorias', fgts, 70, {
      formula: 'soma das verbas rescisorias x fgtsRegimeRate'
    }),
    createLine('MULTA', 'Multa de 40%', multa40, 80, {
      formula: 'remuneracao x mesesFgtsDevidosParaMulta40 x 0.08 x 0.40'
    }),
    createTotalLine(
      avisoPrevio +
        decimoTerceiroAviso +
        feriasAviso +
        decimoTerceiroRescisorio +
        feriasRescisorias +
        saldoSalario +
        fgts +
        multa40,
      90
    )
  ];
}

function resolveQuantityRate(
  rateMode: string | undefined,
  inputs: InitialCalculationInputs,
  helpers: EngineHelpers
): number {
  switch (rateMode) {
    case 'HORA_EXTRA':
      return helpers.valorHora * (1 + normalizePercent(getInputNumber(inputs, 'adicionalHoraExtraPercentual') || 0.5));
    case 'HORA_EXTRA_50':
      return helpers.valorHora * 1.5;
    case 'ADICIONAL_NOTURNO':
      return helpers.valorHora * normalizePercent(getInputNumber(inputs, 'adicionalNoturnoPercentual'));
    case 'SOBREAVISO':
      return helpers.valorHora / 3;
    case 'DIA_COM_ADICIONAL':
      return helpers.valorDia * (1 + normalizePercent(getInputNumber(inputs, 'adicionalDomingoFeriadoDsrPercentual')));
    default:
      return helpers.valorHora;
  }
}

function calculateMonthlyWithStandardReflexes(
  verba: CalculationVerbaSeed,
  inputs: InitialCalculationInputs,
  helpers: EngineHelpers
): CalculationLineResult[] {
  const config = asObject(verba.configJson);
  const baseInputKey = getConfigString(config, 'baseInputKey');
  const multiplierInputKey = getConfigString(config, 'multiplierInputKey') ?? 'meses';
  const periodBase = getInputNumber(inputs, baseInputKey);
  const multiplier = getInputNumber(inputs, multiplierInputKey);
  const principal = periodBase * multiplier;

  const lines = calculateStandardReflexes({
    principal,
    periodBase,
    fgtsMode: verba.fgtsMode,
    helpers,
    apply13: getConfigBoolean(config, 'apply13', true),
    applyFerias: getConfigBoolean(config, 'applyFerias', true),
    applyAviso: getConfigBoolean(config, 'applyAviso', true),
    applyDsr: getConfigBoolean(config, 'applyDsr', false),
    verbaLabel: verba.verbaLabel
  });

  return [...lines, createTotalLine(lines.reduce((sum, line) => sum + line.amount, 0), 90)];
}

function calculateQuantityByRate(
  verba: CalculationVerbaSeed,
  inputs: InitialCalculationInputs,
  helpers: EngineHelpers
): CalculationLineResult[] {
  const config = asObject(verba.configJson);
  const quantityInputKey = getConfigString(config, 'quantityInputKey');
  const multiplierInputKey = getConfigString(config, 'multiplierInputKey') ?? 'meses';
  const quantityPerPeriod = getInputNumber(inputs, quantityInputKey);
  const multiplier = Math.max(getInputNumber(inputs, multiplierInputKey), 1);
  const rate = resolveQuantityRate(getConfigString(config, 'rateMode'), inputs, helpers);
  const periodBase = quantityPerPeriod * rate;
  const principal = periodBase * multiplier;

  const lines = calculateStandardReflexes({
    principal,
    periodBase,
    fgtsMode: verba.fgtsMode,
    helpers,
    apply13: getConfigBoolean(config, 'apply13', true),
    applyFerias: getConfigBoolean(config, 'applyFerias', true),
    applyAviso: getConfigBoolean(config, 'applyAviso', true),
    applyDsr: getConfigBoolean(config, 'applyDsr', false),
    verbaLabel: verba.verbaLabel
  });

  return [...lines, createTotalLine(lines.reduce((sum, line) => sum + line.amount, 0), 90)];
}

function calculateMonthsByBaseAmount(
  verba: CalculationVerbaSeed,
  inputs: InitialCalculationInputs,
  helpers: EngineHelpers
): CalculationLineResult[] {
  const config = asObject(verba.configJson);
  const monthsInputKey = getConfigString(config, 'monthsInputKey') ?? 'meses';
  const baseMode = getConfigString(config, 'baseMode');
  const months = getInputNumber(inputs, monthsInputKey);
  const base = resolveBaseAmount(baseMode, config, inputs, helpers);
  const principal = months * base;
  const fgts = principal * getVerbaFgtsRate(verba.fgtsMode, helpers);

  const lines = [
    createLine('PRINCIPAL', verba.verbaLabel, principal, 10),
    createLine('FGTS', `${verba.verbaLabel} - FGTS`, fgts, 20)
  ].filter((line) => line.amount !== 0);

  return [...lines, createTotalLine(lines.reduce((sum, line) => sum + line.amount, 0), 90)];
}

function calculateFixedAmount(
  verba: CalculationVerbaSeed,
  inputs: InitialCalculationInputs,
  helpers: EngineHelpers
): CalculationLineResult[] {
  const config = asObject(verba.configJson);
  const baseInputKey = getConfigString(config, 'baseInputKey');

  if (verba.verbaCode === 'DESCANSO_SEMANAL_REMUNERADO' && !getInputBoolean(inputs, 'descansoSemanalRemuneradoFlag')) {
    return [];
  }

  const principal = getInputNumber(inputs, baseInputKey);
  const fgts = principal * getVerbaFgtsRate(verba.fgtsMode, helpers);
  const lines = [
    createLine('PRINCIPAL', verba.verbaLabel, principal, 10),
    createLine('FGTS', `${verba.verbaLabel} - FGTS`, fgts, 20)
  ].filter((line) => line.amount !== 0);

  return [...lines, createTotalLine(lines.reduce((sum, line) => sum + line.amount, 0), 90)];
}

function calculatePenalty467(
  verba: CalculationVerbaSeed,
  inputs: InitialCalculationInputs,
  state: CalculationState
): CalculationLineResult[] {
  const config = asObject(verba.configJson);
  const enabled = getInputBoolean(inputs, getConfigString(config, 'flagInputKey'));
  if (!enabled) return [];

  const amount = state.totalRescisorias * 0.5;
  return [createLine('MULTA', verba.verbaLabel, amount, 10), createTotalLine(amount, 90)];
}

function calculatePenalty477(
  verba: CalculationVerbaSeed,
  inputs: InitialCalculationInputs,
  helpers: EngineHelpers
): CalculationLineResult[] {
  const config = asObject(verba.configJson);
  const enabled = getInputBoolean(inputs, getConfigString(config, 'flagInputKey'));
  if (!enabled) return [];

  const amount = helpers.remuneracao;
  return [createLine('MULTA', verba.verbaLabel, amount, 10), createTotalLine(amount, 90)];
}

function calculateVerba(
  verba: CalculationVerbaSeed,
  inputs: InitialCalculationInputs,
  helpers: EngineHelpers,
  state: CalculationState
): CalculationVerbaResult {
  if (!verba.isEnabled) {
    return {
      ...verba,
      lines: [],
      totalAmount: 0
    };
  }

  let lines: CalculationLineResult[] = [];

  switch (verba.strategy) {
    case 'STANDARD_RESCISORY_BLOCK':
      lines = calculateStandardRescisoryBlock(verba, inputs, helpers);
      break;
    case 'MONTHLY_WITH_STANDARD_REFLEXES':
      lines = calculateMonthlyWithStandardReflexes(verba, inputs, helpers);
      break;
    case 'QUANTITY_X_HOURLY_RATE':
    case 'QUANTITY_X_DAILY_RATE':
      lines = calculateQuantityByRate(verba, inputs, helpers);
      break;
    case 'MONTHS_X_REMUNERATION':
      lines = calculateMonthsByBaseAmount(
        {
          ...verba,
          configJson: {
            ...(asObject(verba.configJson)),
            baseMode: 'REMUNERACAO'
          }
        },
        inputs,
        helpers
      );
      break;
    case 'MONTHS_X_BASE_AMOUNT':
      lines = calculateMonthsByBaseAmount(verba, inputs, helpers);
      break;
    case 'FIXED_AMOUNT':
      lines = calculateFixedAmount(verba, inputs, helpers);
      break;
    case 'CONDITIONAL_PENALTY_467':
      lines = calculatePenalty467(verba, inputs, state);
      break;
    case 'CONDITIONAL_PENALTY_477':
      lines = calculatePenalty477(verba, inputs, helpers);
      break;
    case 'RESCISORY_NOTICE':
      lines = calculateStandardRescisoryBlock(verba, inputs, helpers);
      break;
    default:
      lines = [];
  }

  const totalLine = lines.find((line) => line.lineType === 'TOTAL');
  const totalAmount = totalLine
    ? totalLine.amount
    : roundCurrency(lines.reduce((sum, line) => sum + line.amount, 0));

  return {
    ...verba,
    lines,
    totalAmount
  };
}

export function calculateInitialCalculation(params: {
  fgtsRegime: FgtsRegime;
  inputs: InitialCalculationInputs;
  verbas: CalculationVerbaSeed[];
}): InitialCalculationEngineResult {
  const inputs = params.inputs ?? {};
  const helpers = buildHelpers(inputs, params.fgtsRegime);
  const state: CalculationState = {
    totalRescisorias: 0
  };

  const orderedVerbas = [...params.verbas].sort((left, right) => left.sortOrder - right.sortOrder);
  const results: CalculationVerbaResult[] = [];

  for (const verba of orderedVerbas) {
    const result = calculateVerba(verba, inputs, helpers, state);
    results.push(result);

    if (result.verbaCode === 'VERBAS_RESCISORIAS') {
      state.totalRescisorias = result.totalAmount;
    }
  }

  const groupsMap = new Map<string, CalculationGroupSummary>();
  let subtotalVerbas = 0;
  let totalFgts = 0;
  let totalMultas = 0;

  for (const verba of results) {
    subtotalVerbas += verba.totalAmount;

    for (const line of verba.lines) {
      if (line.lineType === 'FGTS') totalFgts += line.amount;
      if (line.lineType === 'MULTA') totalMultas += line.amount;
    }

    const existingGroup = groupsMap.get(verba.groupCode);
    if (existingGroup) {
      existingGroup.total = roundCurrency(existingGroup.total + verba.totalAmount);
    } else {
      groupsMap.set(verba.groupCode, {
        groupCode: verba.groupCode,
        groupLabel: verba.groupLabel,
        total: roundCurrency(verba.totalAmount)
      });
    }
  }

  const honorariosPercentual = normalizePercent(getInputNumber(inputs, 'honorariosPercentual'));
  const totalHonorarios = subtotalVerbas * honorariosPercentual;
  const totalGeral = subtotalVerbas + totalHonorarios;

  return {
    inputSnapshot: {
      ...inputs,
      remuneracaoCalculada: helpers.remuneracao
    },
    summary: {
      fgtsRegime: params.fgtsRegime,
      fgtsRegimeRate: helpers.fgtsRegimeRate,
      remuneration: helpers.remuneracao,
      honorariosPercentual: roundCurrency(honorariosPercentual),
      subtotalVerbas: roundCurrency(subtotalVerbas),
      totalHonorarios: roundCurrency(totalHonorarios),
      totalGeral: roundCurrency(totalGeral),
      totalFgts: roundCurrency(totalFgts),
      totalMultas: roundCurrency(totalMultas),
      groups: Array.from(groupsMap.values()).sort((left, right) => left.groupCode.localeCompare(right.groupCode))
    },
    verbas: results
  };
}
