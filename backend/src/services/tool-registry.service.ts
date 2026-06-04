import { AssistantMode } from '@prisma/client';

type OpenAiToolDefinition = {
  type: 'function';
  name: string;
  description: string;
  strict: boolean;
  parameters: Record<string, unknown>;
};

const OPERATOR_TOOLS: OpenAiToolDefinition[] = [
  {
    type: 'function',
    name: 'create_transaction_draft',
    description:
      'Cria um rascunho de lancamento financeiro para despesa, receita ou transferencia. Use quando o usuario quiser registrar uma transacao.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        description: { type: 'string' },
        amount: { type: 'number' },
        type: { type: 'string', enum: ['INCOME', 'EXPENSE', 'TRANSFER'] },
        date: { type: 'string', description: 'Data em YYYY-MM-DD' },
        dueDate: { type: ['string', 'null'] },
        effectiveDate: { type: ['string', 'null'] },
        status: { type: 'string', enum: ['PENDING', 'COMPLETED'] },
        notes: { type: ['string', 'null'] },
        installmentCount: { type: ['number', 'null'] },
        accountHint: { type: ['string', 'null'] },
        fromAccountHint: { type: ['string', 'null'] },
        toAccountHint: { type: ['string', 'null'] },
        categoryHint: { type: ['string', 'null'] }
      },
      required: ['description', 'amount', 'type', 'date']
    }
  },
  {
    type: 'function',
    name: 'cancel_pending_action',
    description: 'Cancela uma acao pendente do assistente quando o usuario pedir cancelamento.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        pendingActionId: { type: 'number' }
      },
      required: ['pendingActionId']
    }
  },
  {
    type: 'function',
    name: 'get_recent_transactions',
    description:
      'Consulta lancamentos recentes para contexto do operador, principalmente quando o usuario cita uma conta, categoria ou padrao recorrente.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: ['string', 'null'], enum: ['INCOME', 'EXPENSE', 'TRANSFER', null] },
        limit: { type: ['number', 'null'] }
      }
    }
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
