import { AssistantMode } from '@prisma/client';

type OpenAiToolDefinition = {
  type: 'function';
  name: string;
  description: string;
  strict: boolean;
  parameters: Record<string, unknown>;
};

function strictObject(properties: Record<string, unknown>) {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required: Object.keys(properties)
  };
}

const OPERATOR_TOOLS: OpenAiToolDefinition[] = [
  {
    type: 'function',
    name: 'create_transaction_draft',
    description:
      'Cria um rascunho de lancamento financeiro para despesa, receita ou transferencia. Use quando o usuario quiser registrar uma transacao. Prefira informar categoryId/fromAccountId/toAccountId quando essas referencias ja tiverem sido resolvidas por outras tools.',
    strict: true,
    parameters: strictObject({
        description: { type: 'string' },
        amount: { type: 'number' },
        type: { type: 'string', enum: ['INCOME', 'EXPENSE', 'TRANSFER'] },
        date: { type: ['string', 'null'], description: 'Data em YYYY-MM-DD. Se vier nula, o backend assume hoje.' },
        dueDate: { type: ['string', 'null'] },
        effectiveDate: { type: ['string', 'null'] },
        status: { type: ['string', 'null'], enum: ['PENDING', 'COMPLETED', null] },
        notes: { type: ['string', 'null'] },
        installmentCount: { type: ['number', 'null'] },
        accountHint: { type: ['string', 'null'] },
        fromAccountHint: { type: ['string', 'null'] },
        toAccountHint: { type: ['string', 'null'] },
        categoryHint: { type: ['string', 'null'] },
        fromAccountId: { type: ['number', 'null'] },
        toAccountId: { type: ['number', 'null'] },
        categoryId: { type: ['number', 'null'] }
      })
  },
  {
    type: 'function',
    name: 'get_pending_action',
    description:
      'Busca a acao pendente atual da sessao para revisar, cancelar ou corrigir um rascunho antes da confirmacao.',
    strict: true,
    parameters: strictObject({
      pendingActionId: { type: ['number', 'null'] }
    })
  },
  {
    type: 'function',
    name: 'update_transaction_draft',
    description:
      'Atualiza um rascunho pendente ja existente. Use quando o usuario pedir para trocar categoria, conta, valor, descricao, data ou status do rascunho atual.',
    strict: true,
    parameters: strictObject({
      pendingActionId: { type: ['number', 'null'] },
      description: { type: ['string', 'null'] },
      amount: { type: ['number', 'null'] },
      type: { type: ['string', 'null'], enum: ['INCOME', 'EXPENSE', 'TRANSFER', null] },
      date: { type: ['string', 'null'], description: 'Data em YYYY-MM-DD' },
      dueDate: { type: ['string', 'null'] },
      effectiveDate: { type: ['string', 'null'] },
      status: { type: ['string', 'null'], enum: ['PENDING', 'COMPLETED', null] },
      notes: { type: ['string', 'null'] },
      installmentCount: { type: ['number', 'null'] },
      accountHint: { type: ['string', 'null'] },
      fromAccountHint: { type: ['string', 'null'] },
      toAccountHint: { type: ['string', 'null'] },
      categoryHint: { type: ['string', 'null'] },
      fromAccountId: { type: ['number', 'null'] },
      toAccountId: { type: ['number', 'null'] },
      categoryId: { type: ['number', 'null'] }
    })
  },
  {
    type: 'function',
    name: 'confirm_pending_action',
    description:
      'Confirma o rascunho pendente atual quando o usuario disser "sim", "confirmado", "pode confirmar" ou equivalente.',
    strict: true,
    parameters: strictObject({
      pendingActionId: { type: ['number', 'null'] }
    })
  },
  {
    type: 'function',
    name: 'search_categories',
    description:
      'Consulta categorias financeiras da empresa para descobrir a melhor categoria e o id correto antes de criar ou ajustar um lancamento. Se query vier nula, use como listagem de categorias. Reformule a busca por conceito quando fizer sentido, por exemplo: cabeleireiro -> beleza ou salao de beleza.',
    strict: true,
    parameters: strictObject({
      query: { type: ['string', 'null'] },
      type: { type: ['string', 'null'], enum: ['INCOME', 'EXPENSE', 'TRANSFER', null] },
      limit: { type: ['number', 'null'], minimum: 1, maximum: 20 }
    })
  },
  {
    type: 'function',
    name: 'create_category',
    description:
      'Cria uma nova categoria financeira quando a categoria desejada nao existir. Use apenas depois de consultar categorias existentes para evitar duplicidade. Se icon vier nulo, o backend sugere automaticamente um icone adequado.',
    strict: true,
    parameters: strictObject({
      name: { type: 'string' },
      type: { type: 'string', enum: ['INCOME', 'EXPENSE', 'TRANSFER'] },
      color: { type: ['string', 'null'] },
      icon: { type: ['string', 'null'] },
      parentCategoryId: { type: ['number', 'null'] },
      parentCategoryHint: { type: ['string', 'null'] },
      accountingCode: { type: ['string', 'null'] }
    })
  },
  {
    type: 'function',
    name: 'search_accounts',
    description:
      'Consulta contas e cartoes acessiveis ao usuario, incluindo saldo, tipo e contexto de cartao de credito, para escolher a conta correta do lancamento. Na duvida, nomes de banco devem priorizar conta de disponibilidade; so priorize cartao se houver indicacao explicita de credito, fatura, cartao ou parcelamento.',
    strict: true,
    parameters: strictObject({
      query: { type: ['string', 'null'] },
      type: {
        type: ['string', 'null'],
        enum: ['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'CASH', null]
      },
      limit: { type: ['number', 'null'], minimum: 1, maximum: 20 }
    })
  },
  {
    type: 'function',
    name: 'cancel_pending_action',
    description:
      'Cancela uma acao pendente do assistente quando o usuario pedir cancelamento. Se pendingActionId vier nulo, cancele a ultima acao pendente da sessao.',
    strict: true,
    parameters: strictObject({
      pendingActionId: { type: ['number', 'null'] }
    })
  },
  {
    type: 'function',
    name: 'get_recent_transactions',
    description:
      'Consulta lancamentos recentes para contexto do operador, principalmente quando o usuario cita um padrao recorrente. Nao use esta tool como substituta da busca direta por categorias ou contas.',
    strict: true,
    parameters: strictObject({
        type: { type: ['string', 'null'], enum: ['INCOME', 'EXPENSE', 'TRANSFER', null] },
        limit: { type: ['number', 'null'], minimum: 1, maximum: 10 }
      })
  }
];

export default class ToolRegistryService {
  static getToolsForMode(mode: AssistantMode): OpenAiToolDefinition[] {
    if (mode === AssistantMode.OPERATOR) {
      return OPERATOR_TOOLS;
    }

    return [];
  }
}
