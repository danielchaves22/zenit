export type InitialCalculationFieldType =
  | 'currency'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'textarea';

export interface InitialCalculationFieldOption {
  value: string;
  label: string;
}

export interface InitialCalculationFieldDefinition {
  key: string;
  label: string;
  type: InitialCalculationFieldType;
  placeholder?: string;
  description?: string;
  min?: number;
  step?: string;
  options?: InitialCalculationFieldOption[];
}

export interface InitialCalculationSectionDefinition {
  key: string;
  title: string;
  description?: string;
  columns?: 1 | 2 | 3;
  fields: InitialCalculationFieldDefinition[];
}

export interface CustomVerbaGroupOption {
  value: string;
  label: string;
}

export const FGTS_REGIME_OPTIONS: InitialCalculationFieldOption[] = [
  { value: 'FGTS_8', label: 'FGTS 8%' },
  { value: 'FGTS_11_2', label: 'FGTS 11,2%' }
];

export const CUSTOM_VERBA_GROUP_OPTIONS: CustomVerbaGroupOption[] = [
  { value: 'VERBAS_MENSAIS', label: 'Verbas Mensais' },
  { value: 'JORNADA', label: 'Jornada e Adicionais' },
  { value: 'INDENIZATORIAS', label: 'Indenizatorias e Especiais' },
  { value: 'MULTAS_E_HONORARIOS', label: 'Multas e Honorarios' }
];

export const CUSTOM_VERBA_STRATEGY_OPTIONS: InitialCalculationFieldOption[] = [
  { value: 'FIXED_AMOUNT', label: 'Valor fixo' },
  { value: 'MONTHLY_WITH_STANDARD_REFLEXES', label: 'Valor mensal com reflexos' }
];

export const CUSTOM_VERBA_FGTS_OPTIONS: InitialCalculationFieldOption[] = [
  { value: 'NONE', label: 'Sem FGTS' },
  { value: 'REGIME', label: 'FGTS do regime' },
  { value: 'FIXED_8', label: 'FGTS fixo 8%' }
];

export const INITIAL_CALCULATION_SECTIONS: InitialCalculationSectionDefinition[] = [
  {
    key: 'vinculo',
    title: 'Vinculo',
    description: 'Dados basicos do contrato e do periodo de apuracao.',
    columns: 3,
    fields: [
      { key: 'dataAdmissao', label: 'Data de admissao', type: 'date' },
      { key: 'dataDemissao', label: 'Data de demissao', type: 'date' },
      { key: 'meses', label: 'Meses', type: 'number', min: 0, step: '0.01', placeholder: '0' }
    ]
  },
  {
    key: 'bases',
    title: 'Bases salariais',
    description: 'Bases que alimentam remuneracao, valor-dia e valor-hora.',
    columns: 2,
    fields: [
      { key: 'salarioBase', label: 'Salario base', type: 'currency' },
      { key: 'remuneracao', label: 'Remuneracao (opcional)', type: 'currency', description: 'Se vazio, o sistema calcula a remuneracao a partir das verbas integraveis.' },
      { key: 'salarioMinimoAno', label: 'Ano do salario minimo', type: 'number', min: 1900, step: '1' },
      { key: 'salarioMinimo', label: 'Salario minimo', type: 'currency' },
      { key: 'cargaMensal', label: 'Carga mensal', type: 'number', min: 0, step: '0.01', placeholder: '220' },
      { key: 'honorariosPercentual', label: 'Honorarios (%)', type: 'number', min: 0, step: '0.01', placeholder: '15' }
    ]
  },
  {
    key: 'rescisorias',
    title: 'Verbas rescisorias',
    columns: 2,
    fields: [
      { key: 'diasAvisoPrevio', label: 'Dias de aviso previo', type: 'number', min: 0, step: '1' },
      { key: 'avisoPrevioRecebido', label: 'Aviso previo recebido', type: 'currency' },
      { key: 'avos13SobreAviso', label: 'Avos de 13 sobre aviso', type: 'number', min: 0, step: '0.01' },
      { key: 'valor13SobreAvisoRecebido', label: '13 sobre aviso recebido', type: 'currency' },
      { key: 'avosFeriasSobreAviso', label: 'Avos de ferias sobre aviso', type: 'number', min: 0, step: '0.01' },
      { key: 'valorFeriasSobreAvisoRecebido', label: 'Ferias sobre aviso recebidas', type: 'currency' },
      { key: 'avos13Rescisorio', label: 'Avos de 13 rescisorio', type: 'number', min: 0, step: '0.01' },
      { key: 'valor13RescisorioRecebido', label: '13 rescisorio recebido', type: 'currency' },
      { key: 'avosFeriasRescisorio', label: 'Avos de ferias rescisorias', type: 'number', min: 0, step: '0.01' },
      { key: 'valorFeriasRescisorioRecebido', label: 'Ferias rescisorias recebidas', type: 'currency' },
      { key: 'diasSaldoSalario', label: 'Dias de saldo de salario', type: 'number', min: 0, step: '1' },
      { key: 'valorSaldoSalarioRecebido', label: 'Saldo de salario recebido', type: 'currency' },
      { key: 'mesesFgtsDevidosParaMulta40', label: 'Meses de FGTS para multa 40%', type: 'number', min: 0, step: '0.01' }
    ]
  },
  {
    key: 'verbasMensais',
    title: 'Verbas mensais integraveis',
    columns: 2,
    fields: [
      { key: 'valeAlimentacaoPagamento', label: 'Vale alimentacao - pagamento', type: 'currency' },
      { key: 'valeAlimentacaoIntegracao', label: 'Vale alimentacao - integracao', type: 'currency' },
      { key: 'salarioExtrafolha', label: 'Salario extrafolha', type: 'currency' },
      { key: 'equiparacaoSalarial', label: 'Equiparacao salarial', type: 'currency' },
      { key: 'acumuloFuncao', label: 'Acumulo de funcao', type: 'currency' },
      { key: 'diferencaSalarial', label: 'Diferenca salarial', type: 'currency' },
      { key: 'comissaoPagamento', label: 'Comissao - pagamento', type: 'currency' },
      { key: 'comissaoIntegracao', label: 'Comissao - integracao', type: 'currency' },
      { key: 'gorjetasPagamento', label: 'Gorjetas - pagamento', type: 'currency' },
      { key: 'gorjetasIntegracao', label: 'Gorjetas - integracao', type: 'currency' },
      { key: 'gratificacoesPagamento', label: 'Gratificacoes - pagamento', type: 'currency' },
      { key: 'gratificacoesIntegracao', label: 'Gratificacoes - integracao', type: 'currency' }
    ]
  },
  {
    key: 'jornada',
    title: 'Jornada e adicionais',
    columns: 2,
    fields: [
      { key: 'periculosidadeGrau', label: 'Periculosidade (%)', type: 'number', min: 0, step: '0.01', placeholder: '30' },
      { key: 'periculosidadeMeses', label: 'Meses de periculosidade', type: 'number', min: 0, step: '0.01' },
      { key: 'insalubridadeGrau', label: 'Insalubridade (%)', type: 'number', min: 0, step: '0.01' },
      { key: 'insalubridadeMeses', label: 'Meses de insalubridade', type: 'number', min: 0, step: '0.01' },
      { key: 'adicionalNoturnoPercentual', label: 'Adicional noturno (%)', type: 'number', min: 0, step: '0.01' },
      { key: 'horasNoturnasQuantidade', label: 'Horas noturnas por mes', type: 'number', min: 0, step: '0.01' },
      { key: 'adicionalHoraExtraPercentual', label: 'Adicional hora extra (%)', type: 'number', min: 0, step: '0.01', placeholder: '50' },
      { key: 'adicionalDomingoFeriadoDsrPercentual', label: 'Adicional domingo/feriado/DSR (%)', type: 'number', min: 0, step: '0.01', placeholder: '100' },
      { key: 'horasExtrasQuantidade', label: 'Horas extras por mes', type: 'number', min: 0, step: '0.01' },
      { key: 'intrajornadaQuantidade', label: 'Intrajornada por mes', type: 'number', min: 0, step: '0.01' },
      { key: 'interjornadaQuantidade', label: 'Interjornada por mes', type: 'number', min: 0, step: '0.01' },
      { key: 'intervaloMulherQuantidade', label: 'Intervalo da mulher por mes', type: 'number', min: 0, step: '0.01' },
      { key: 'intersemanalQuantidade', label: 'Intersemanal por mes', type: 'number', min: 0, step: '0.01' },
      { key: 'laborNaFolgaQuantidade', label: 'Labor em dia de folga por mes', type: 'number', min: 0, step: '0.01' },
      { key: 'dsrAposSetimoDiaQuantidade', label: 'DSR apos setimo dia por mes', type: 'number', min: 0, step: '0.01' },
      { key: 'domingoFeriadoQuantidade', label: 'Domingo e feriado por mes', type: 'number', min: 0, step: '0.01' },
      { key: 'domingoQuantidade', label: 'Domingo por mes', type: 'number', min: 0, step: '0.01' },
      { key: 'feriadoQuantidade', label: 'Feriado por mes', type: 'number', min: 0, step: '0.01' },
      { key: 'sobreavisoQuantidade', label: 'Sobreaviso por mes', type: 'number', min: 0, step: '0.01' },
      { key: 'descansoSemanalRemuneradoFlag', label: 'Considerar DSR', type: 'boolean' },
      { key: 'descansoSemanalRemuneradoValor', label: 'Valor do DSR', type: 'currency' }
    ]
  },
  {
    key: 'indenizatorias',
    title: 'Indenizatorias e especiais',
    columns: 2,
    fields: [
      { key: 'invalidadeDispensaReintegracaoMeses', label: 'Invalidade da dispensa - reintegracao (meses)', type: 'number', min: 0, step: '0.01' },
      { key: 'invalidadeDispensaIndenizacaoMeses', label: 'Invalidade da dispensa - indenizacao (meses)', type: 'number', min: 0, step: '0.01' },
      { key: 'estabilidadeMeses', label: 'Estabilidade (meses)', type: 'number', min: 0, step: '0.01' },
      { key: 'dispensaDiscriminatoriaReintegracaoMeses', label: 'Dispensa discriminatoria - reintegracao (meses)', type: 'number', min: 0, step: '0.01' },
      { key: 'dispensaDiscriminatoriaSucessivoMeses', label: 'Dispensa discriminatoria - sucessivo (meses)', type: 'number', min: 0, step: '0.01' },
      { key: 'danosMoraisMeses', label: 'Danos morais (meses)', type: 'number', min: 0, step: '0.01' },
      { key: 'danosMoraisValorFixo', label: 'Danos morais - valor fixo', type: 'currency' },
      { key: 'assedioMoral', label: 'Assedio moral', type: 'currency' },
      { key: 'danosMateriaisVencidaMeses', label: 'Danos materiais vencida (meses)', type: 'number', min: 0, step: '0.01' },
      { key: 'danosMateriaisVincendaMeses', label: 'Danos materiais vincenda (meses)', type: 'number', min: 0, step: '0.01' },
      { key: 'custeioTratamento12Meses', label: 'Custeio do tratamento', type: 'currency' },
      { key: 'parcelaIndenizatoria', label: 'Parcela indenizatoria', type: 'currency' },
      { key: 'multa467Flag', label: 'Aplicar multa 467', type: 'boolean' },
      { key: 'multa477Flag', label: 'Aplicar multa 477', type: 'boolean' }
    ]
  }
];

export function buildInitialCalculationDefaults(): Record<string, string | boolean> {
  return INITIAL_CALCULATION_SECTIONS.reduce<Record<string, string | boolean>>((accumulator, section) => {
    for (const field of section.fields) {
      accumulator[field.key] = field.type === 'boolean' ? false : '';
    }

    return accumulator;
  }, {});
}
