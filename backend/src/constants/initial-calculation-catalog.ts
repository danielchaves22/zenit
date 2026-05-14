import {
  CalculationVerbaFgtsMode,
  CalculationVerbaScope,
  CalculationVerbaStrategy
} from '@prisma/client';

export const DEFAULT_INITIAL_CALCULATION_RULE_SET_CODE = 'INITIAL_V1';
export const DEFAULT_INITIAL_CALCULATION_RULE_SET_NAME = 'Calculo Inicial v1';

export interface DefaultCalculationVerbaTemplate {
  scope: CalculationVerbaScope;
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

function monthlyStandardTemplate(
  code: string,
  label: string,
  sortOrder: number,
  baseInputKey: string,
  fgtsMode: CalculationVerbaFgtsMode = 'REGIME'
): DefaultCalculationVerbaTemplate {
  return {
    scope: 'SYSTEM',
    code,
    label,
    groupCode: 'VERBAS_MENSAIS',
    groupLabel: 'Verbas Mensais',
    strategy: 'MONTHLY_WITH_STANDARD_REFLEXES',
    fgtsMode,
    sortOrder,
    configJson: {
      baseInputKey,
      multiplierInputKey: 'meses',
      apply13: true,
      applyFerias: true,
      applyAviso: true,
      applyDsr: false
    },
    inputSchemaJson: {
      requiredInputs: [baseInputKey, 'meses']
    }
  };
}

function monthsXBaseAmountTemplate(
  code: string,
  label: string,
  sortOrder: number,
  monthsInputKey: string,
  baseMode: string,
  fgtsMode: CalculationVerbaFgtsMode = 'NONE',
  groupCode = 'INDENIZATORIAS',
  groupLabel = 'Indenizatorias e Especiais'
): DefaultCalculationVerbaTemplate {
  return {
    scope: 'SYSTEM',
    code,
    label,
    groupCode,
    groupLabel,
    strategy: 'MONTHS_X_BASE_AMOUNT',
    fgtsMode,
    sortOrder,
    configJson: {
      monthsInputKey,
      baseMode
    },
    inputSchemaJson: {
      requiredInputs: [monthsInputKey]
    }
  };
}

function fixedAmountTemplate(
  code: string,
  label: string,
  sortOrder: number,
  groupCode: string,
  groupLabel: string,
  baseInputKey: string,
  extraRequiredInputs: string[] = [],
  fgtsMode: CalculationVerbaFgtsMode = 'NONE'
): DefaultCalculationVerbaTemplate {
  return {
    scope: 'SYSTEM',
    code,
    label,
    groupCode,
    groupLabel,
    strategy: 'FIXED_AMOUNT',
    fgtsMode,
    sortOrder,
    configJson: {
      baseInputKey
    },
    inputSchemaJson: {
      requiredInputs: [baseInputKey, ...extraRequiredInputs]
    }
  };
}

const JORNADA_GROUP_CODE = 'JORNADA';
const JORNADA_GROUP_LABEL = 'Jornada e Adicionais';
const INDENIZATORIAS_GROUP_CODE = 'INDENIZATORIAS';
const INDENIZATORIAS_GROUP_LABEL = 'Indenizatorias e Especiais';
const MULTAS_GROUP_CODE = 'MULTAS_E_HONORARIOS';
const MULTAS_GROUP_LABEL = 'Multas e Honorarios';

export const DEFAULT_INITIAL_CALCULATION_VERBA_TEMPLATES: DefaultCalculationVerbaTemplate[] = [
  {
    scope: 'SYSTEM',
    code: 'VERBAS_RESCISORIAS',
    label: 'Verbas Rescisorias',
    groupCode: 'RESCISORIAS',
    groupLabel: 'Verbas Rescisorias',
    strategy: 'STANDARD_RESCISORY_BLOCK',
    fgtsMode: 'REGIME',
    sortOrder: 10,
    inputSchemaJson: {
      requiredInputs: [
        'diasAvisoPrevio',
        'avisoPrevioRecebido',
        'avos13SobreAviso',
        'valor13SobreAvisoRecebido',
        'avosFeriasSobreAviso',
        'valorFeriasSobreAvisoRecebido',
        'avos13Rescisorio',
        'valor13RescisorioRecebido',
        'avosFeriasRescisorio',
        'valorFeriasRescisorioRecebido',
        'diasSaldoSalario',
        'valorSaldoSalarioRecebido',
        'mesesFgtsDevidosParaMulta40'
      ]
    }
  },
  monthlyStandardTemplate('VALE_ALIMENTACAO_PAGAMENTO', 'Vale Alimentacao - Pagamento', 20, 'valeAlimentacaoPagamento'),
  monthlyStandardTemplate('VALE_ALIMENTACAO_INTEGRACAO', 'Vale Alimentacao - Integracao', 30, 'valeAlimentacaoIntegracao'),
  monthlyStandardTemplate('SALARIO_EXTRAFOLHA', 'Salario Extrafolha', 40, 'salarioExtrafolha'),
  monthlyStandardTemplate('EQUIPARACAO_SALARIAL', 'Equiparacao Salarial', 50, 'equiparacaoSalarial'),
  monthlyStandardTemplate('ACUMULO_FUNCAO', 'Acumulo de Funcao', 60, 'acumuloFuncao'),
  monthlyStandardTemplate('DIFERENCA_SALARIAL', 'Diferenca Salarial', 70, 'diferencaSalarial'),
  monthlyStandardTemplate('COMISSAO_PAGAMENTO', 'Comissao - Pagamento', 80, 'comissaoPagamento'),
  monthlyStandardTemplate('COMISSAO_INTEGRACAO', 'Comissao - Integracao', 90, 'comissaoIntegracao'),
  monthlyStandardTemplate('GORJETAS_PAGAMENTO', 'Gorjetas - Pagamento', 100, 'gorjetasPagamento'),
  monthlyStandardTemplate('GORJETAS_INTEGRACAO', 'Gorjetas - Integracao', 110, 'gorjetasIntegracao'),
  monthlyStandardTemplate('GRATIFICACOES_PAGAMENTO', 'Gratificacoes - Pagamento', 120, 'gratificacoesPagamento'),
  monthlyStandardTemplate('GRATIFICACOES_INTEGRACAO', 'Gratificacoes - Integracao', 130, 'gratificacoesIntegracao'),
  {
    scope: 'SYSTEM',
    code: 'PERICULOSIDADE',
    label: 'Periculosidade',
    groupCode: JORNADA_GROUP_CODE,
    groupLabel: JORNADA_GROUP_LABEL,
    strategy: 'MONTHS_X_BASE_AMOUNT',
    fgtsMode: 'REGIME',
    sortOrder: 140,
    configJson: {
      monthsInputKey: 'periculosidadeMeses',
      baseMode: 'PERICULOSIDADE'
    },
    inputSchemaJson: {
      requiredInputs: ['periculosidadeMeses', 'salarioBase', 'periculosidadeGrau']
    }
  },
  {
    scope: 'SYSTEM',
    code: 'INSALUBRIDADE',
    label: 'Insalubridade',
    groupCode: JORNADA_GROUP_CODE,
    groupLabel: JORNADA_GROUP_LABEL,
    strategy: 'MONTHS_X_BASE_AMOUNT',
    fgtsMode: 'REGIME',
    sortOrder: 150,
    configJson: {
      monthsInputKey: 'insalubridadeMeses',
      baseMode: 'INSALUBRIDADE'
    },
    inputSchemaJson: {
      requiredInputs: ['insalubridadeMeses', 'salarioMinimo', 'insalubridadeGrau']
    }
  },
  {
    scope: 'SYSTEM',
    code: 'ADICIONAL_NOTURNO',
    label: 'Adicional Noturno',
    groupCode: JORNADA_GROUP_CODE,
    groupLabel: JORNADA_GROUP_LABEL,
    strategy: 'QUANTITY_X_HOURLY_RATE',
    fgtsMode: 'REGIME',
    sortOrder: 200,
    configJson: {
      quantityInputKey: 'horasNoturnasQuantidade',
      rateMode: 'ADICIONAL_NOTURNO',
      multiplierInputKey: 'meses'
    },
    inputSchemaJson: {
      requiredInputs: ['horasNoturnasQuantidade', 'adicionalNoturnoPercentual', 'cargaMensal', 'meses']
    }
  },
  {
    scope: 'SYSTEM',
    code: 'HORAS_EXTRAS',
    label: 'Horas Extras',
    groupCode: JORNADA_GROUP_CODE,
    groupLabel: JORNADA_GROUP_LABEL,
    strategy: 'QUANTITY_X_HOURLY_RATE',
    fgtsMode: 'REGIME',
    sortOrder: 210,
    configJson: {
      quantityInputKey: 'horasExtrasQuantidade',
      rateMode: 'HORA_EXTRA',
      multiplierInputKey: 'meses'
    },
    inputSchemaJson: {
      requiredInputs: ['horasExtrasQuantidade', 'adicionalHoraExtraPercentual', 'cargaMensal', 'meses']
    }
  },
  {
    scope: 'SYSTEM',
    code: 'INTRAJORNADA',
    label: 'Intrajornada',
    groupCode: JORNADA_GROUP_CODE,
    groupLabel: JORNADA_GROUP_LABEL,
    strategy: 'QUANTITY_X_HOURLY_RATE',
    fgtsMode: 'REGIME',
    sortOrder: 220,
    configJson: {
      quantityInputKey: 'intrajornadaQuantidade',
      rateMode: 'HORA_EXTRA_50',
      multiplierInputKey: 'meses'
    },
    inputSchemaJson: {
      requiredInputs: ['intrajornadaQuantidade', 'cargaMensal', 'meses']
    }
  },
  {
    scope: 'SYSTEM',
    code: 'INTERJORNADA',
    label: 'Interjornada',
    groupCode: JORNADA_GROUP_CODE,
    groupLabel: JORNADA_GROUP_LABEL,
    strategy: 'QUANTITY_X_HOURLY_RATE',
    fgtsMode: 'REGIME',
    sortOrder: 230,
    configJson: {
      quantityInputKey: 'interjornadaQuantidade',
      rateMode: 'HORA_EXTRA_50',
      multiplierInputKey: 'meses'
    },
    inputSchemaJson: {
      requiredInputs: ['interjornadaQuantidade', 'cargaMensal', 'meses']
    }
  },
  {
    scope: 'SYSTEM',
    code: 'INTERVALO_DA_MULHER',
    label: 'Intervalo da Mulher',
    groupCode: JORNADA_GROUP_CODE,
    groupLabel: JORNADA_GROUP_LABEL,
    strategy: 'QUANTITY_X_HOURLY_RATE',
    fgtsMode: 'REGIME',
    sortOrder: 240,
    configJson: {
      quantityInputKey: 'intervaloMulherQuantidade',
      rateMode: 'HORA_EXTRA_50',
      multiplierInputKey: 'meses'
    },
    inputSchemaJson: {
      requiredInputs: ['intervaloMulherQuantidade', 'cargaMensal', 'meses']
    }
  },
  {
    scope: 'SYSTEM',
    code: 'INTERSEMANAL',
    label: 'Intersemanal',
    groupCode: JORNADA_GROUP_CODE,
    groupLabel: JORNADA_GROUP_LABEL,
    strategy: 'QUANTITY_X_HOURLY_RATE',
    fgtsMode: 'REGIME',
    sortOrder: 250,
    configJson: {
      quantityInputKey: 'intersemanalQuantidade',
      rateMode: 'HORA_EXTRA_50',
      multiplierInputKey: 'meses'
    },
    inputSchemaJson: {
      requiredInputs: ['intersemanalQuantidade', 'cargaMensal', 'meses']
    }
  },
  {
    scope: 'SYSTEM',
    code: 'LABOR_EM_DIA_DE_FOLGA',
    label: 'Labor em Dia de Folga',
    groupCode: JORNADA_GROUP_CODE,
    groupLabel: JORNADA_GROUP_LABEL,
    strategy: 'QUANTITY_X_HOURLY_RATE',
    fgtsMode: 'REGIME',
    sortOrder: 260,
    configJson: {
      quantityInputKey: 'laborNaFolgaQuantidade',
      rateMode: 'DIA_COM_ADICIONAL',
      multiplierInputKey: 'meses'
    },
    inputSchemaJson: {
      requiredInputs: ['laborNaFolgaQuantidade', 'adicionalDomingoFeriadoDsrPercentual', 'meses']
    }
  },
  {
    scope: 'SYSTEM',
    code: 'DSR_APOS_SETIMO_DIA',
    label: 'DSR Apos o Setimo Dia',
    groupCode: JORNADA_GROUP_CODE,
    groupLabel: JORNADA_GROUP_LABEL,
    strategy: 'QUANTITY_X_HOURLY_RATE',
    fgtsMode: 'REGIME',
    sortOrder: 270,
    configJson: {
      quantityInputKey: 'dsrAposSetimoDiaQuantidade',
      rateMode: 'DIA_COM_ADICIONAL',
      multiplierInputKey: 'meses'
    },
    inputSchemaJson: {
      requiredInputs: ['dsrAposSetimoDiaQuantidade', 'adicionalDomingoFeriadoDsrPercentual', 'meses']
    }
  },
  {
    scope: 'SYSTEM',
    code: 'DOMINGO_E_FERIADO',
    label: 'Domingo e Feriado',
    groupCode: JORNADA_GROUP_CODE,
    groupLabel: JORNADA_GROUP_LABEL,
    strategy: 'QUANTITY_X_DAILY_RATE',
    fgtsMode: 'REGIME',
    sortOrder: 280,
    configJson: {
      quantityInputKey: 'domingoFeriadoQuantidade',
      rateMode: 'DIA_COM_ADICIONAL',
      multiplierInputKey: 'meses'
    },
    inputSchemaJson: {
      requiredInputs: ['domingoFeriadoQuantidade', 'adicionalDomingoFeriadoDsrPercentual', 'meses']
    }
  },
  {
    scope: 'SYSTEM',
    code: 'DOMINGO',
    label: 'Domingo',
    groupCode: JORNADA_GROUP_CODE,
    groupLabel: JORNADA_GROUP_LABEL,
    strategy: 'QUANTITY_X_DAILY_RATE',
    fgtsMode: 'REGIME',
    sortOrder: 290,
    configJson: {
      quantityInputKey: 'domingoQuantidade',
      rateMode: 'DIA_COM_ADICIONAL',
      multiplierInputKey: 'meses'
    },
    inputSchemaJson: {
      requiredInputs: ['domingoQuantidade', 'adicionalDomingoFeriadoDsrPercentual', 'meses']
    }
  },
  {
    scope: 'SYSTEM',
    code: 'FERIADO',
    label: 'Feriado',
    groupCode: JORNADA_GROUP_CODE,
    groupLabel: JORNADA_GROUP_LABEL,
    strategy: 'QUANTITY_X_DAILY_RATE',
    fgtsMode: 'REGIME',
    sortOrder: 300,
    configJson: {
      quantityInputKey: 'feriadoQuantidade',
      rateMode: 'DIA_COM_ADICIONAL',
      multiplierInputKey: 'meses'
    },
    inputSchemaJson: {
      requiredInputs: ['feriadoQuantidade', 'adicionalDomingoFeriadoDsrPercentual', 'meses']
    }
  },
  {
    scope: 'SYSTEM',
    code: 'SOBREAVISO',
    label: 'Sobreaviso',
    groupCode: JORNADA_GROUP_CODE,
    groupLabel: JORNADA_GROUP_LABEL,
    strategy: 'QUANTITY_X_HOURLY_RATE',
    fgtsMode: 'REGIME',
    sortOrder: 310,
    configJson: {
      quantityInputKey: 'sobreavisoQuantidade',
      rateMode: 'SOBREAVISO',
      multiplierInputKey: 'meses'
    },
    inputSchemaJson: {
      requiredInputs: ['sobreavisoQuantidade', 'cargaMensal', 'meses']
    }
  },
  fixedAmountTemplate(
    'DESCANSO_SEMANAL_REMUNERADO',
    'Descanso Semanal Remunerado',
    320,
    JORNADA_GROUP_CODE,
    JORNADA_GROUP_LABEL,
    'descansoSemanalRemuneradoValor',
    ['descansoSemanalRemuneradoFlag']
  ),
  monthsXBaseAmountTemplate(
    'INVALIDADE_DISPENSA_REINTEGRACAO',
    'Invalidade da Dispensa - Reintegracao',
    400,
    'invalidadeDispensaReintegracaoMeses',
    'REMUNERACAO',
    'FIXED_8'
  ),
  monthsXBaseAmountTemplate(
    'INVALIDADE_DISPENSA_INDENIZACAO',
    'Invalidade da Dispensa - Indenizacao',
    410,
    'invalidadeDispensaIndenizacaoMeses',
    'REMUNERACAO',
    'REGIME'
  ),
  {
    scope: 'SYSTEM',
    code: 'ESTABILIDADE',
    label: 'Estabilidade',
    groupCode: INDENIZATORIAS_GROUP_CODE,
    groupLabel: INDENIZATORIAS_GROUP_LABEL,
    strategy: 'MONTHS_X_REMUNERATION',
    fgtsMode: 'REGIME',
    sortOrder: 420,
    configJson: {
      monthsInputKey: 'estabilidadeMeses'
    },
    inputSchemaJson: {
      requiredInputs: ['estabilidadeMeses', 'remuneracao']
    }
  },
  monthsXBaseAmountTemplate(
    'DISPENSA_DISCRIMINATORIA_REINTEGRACAO',
    'Dispensa Discriminatoria - Reintegracao',
    430,
    'dispensaDiscriminatoriaReintegracaoMeses',
    'REMUNERACAO',
    'FIXED_8'
  ),
  monthsXBaseAmountTemplate(
    'DISPENSA_DISCRIMINATORIA_SUCESSIVO',
    'Dispensa Discriminatoria - Sucessivo',
    440,
    'dispensaDiscriminatoriaSucessivoMeses',
    'REMUNERACAO'
  ),
  monthsXBaseAmountTemplate(
    'DANOS_MORAIS',
    'Danos Morais',
    450,
    'danosMoraisMeses',
    'REMUNERACAO'
  ),
  fixedAmountTemplate(
    'DANOS_MORAIS_VALOR_FIXO',
    'Danos Morais (Valor Fixo)',
    460,
    INDENIZATORIAS_GROUP_CODE,
    INDENIZATORIAS_GROUP_LABEL,
    'danosMoraisValorFixo'
  ),
  fixedAmountTemplate(
    'ASSEDIO_MORAL',
    'Assedio Moral',
    470,
    INDENIZATORIAS_GROUP_CODE,
    INDENIZATORIAS_GROUP_LABEL,
    'assedioMoral'
  ),
  monthsXBaseAmountTemplate(
    'DANOS_MATERIAIS_VENCIDA',
    'Danos Materiais - Perda da Capacidade - Vencida',
    480,
    'danosMateriaisVencidaMeses',
    'REMUNERACAO'
  ),
  monthsXBaseAmountTemplate(
    'DANOS_MATERIAIS_VINCENDA',
    'Danos Materiais - Perda da Capacidade - Vincenda',
    490,
    'danosMateriaisVincendaMeses',
    'REMUNERACAO'
  ),
  fixedAmountTemplate(
    'CUSTEIO_TRATAMENTO',
    'Custeio do Tratamento',
    500,
    INDENIZATORIAS_GROUP_CODE,
    INDENIZATORIAS_GROUP_LABEL,
    'custeioTratamento12Meses'
  ),
  fixedAmountTemplate(
    'PARCELA_INDENIZATORIA',
    'Parcela Indenizatoria',
    510,
    INDENIZATORIAS_GROUP_CODE,
    INDENIZATORIAS_GROUP_LABEL,
    'parcelaIndenizatoria'
  ),
  {
    scope: 'SYSTEM',
    code: 'MULTA_467',
    label: 'Multa art. 467',
    groupCode: MULTAS_GROUP_CODE,
    groupLabel: MULTAS_GROUP_LABEL,
    strategy: 'CONDITIONAL_PENALTY_467',
    fgtsMode: 'NONE',
    sortOrder: 600,
    configJson: {
      flagInputKey: 'multa467Flag'
    },
    inputSchemaJson: {
      requiredInputs: ['multa467Flag']
    }
  },
  {
    scope: 'SYSTEM',
    code: 'MULTA_477',
    label: 'Multa art. 477',
    groupCode: MULTAS_GROUP_CODE,
    groupLabel: MULTAS_GROUP_LABEL,
    strategy: 'CONDITIONAL_PENALTY_477',
    fgtsMode: 'NONE',
    sortOrder: 610,
    configJson: {
      flagInputKey: 'multa477Flag'
    },
    inputSchemaJson: {
      requiredInputs: ['multa477Flag']
    }
  }
];
