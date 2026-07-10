import { AssistantMode } from '@prisma/client';
import { z } from 'zod';
import { DEFAULT_OPENAI_MODEL, LEGACY_OPENAI_MODEL_FALLBACK, resolveOpenAiModel, shouldRetryWithLegacyOpenAiModel } from '../constants/openai';
import OpenAiIntegrationService from './openai-integration.service';
import ToolRegistryService from './tool-registry.service';
import ToolExecutorService, { AssistantToolExecutionContext, ToolExecutionResult } from './tool-executor.service';
import AssistantTraceService from './assistant-trace.service';
import { ConversationMessage } from './assistant-message.service';

const finalAssistantPayloadSchema = z.object({
  mode: z.literal('OPERATOR'),
  message: z.string().trim().min(1).max(1200)
});

type ResponsesApiResult = {
  ok: boolean;
  status: number;
  raw: string;
  parsed: any;
  model: string;
};

type RunAssistantTurnResult = {
  mode: 'OPERATOR';
  message: string;
  pendingAction?: ToolExecutionResult['pendingAction'];
  telemetry: {
    model: string;
    promptVersion: string;
    latencyMs: number;
    toolCalls: number;
    usedFallbackModel?: boolean;
  };
};

const MAX_TOOL_ITERATIONS = 6;

const FINAL_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mode: {
      type: 'string',
      enum: ['OPERATOR']
    },
    message: {
      type: 'string'
    }
  },
  required: ['mode', 'message']
};

function parseJsonSafe(raw: string | null | undefined): any {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractOutputText(parsed: any): string {
  if (typeof parsed?.output_text === 'string' && parsed.output_text.trim()) {
    return parsed.output_text.trim();
  }

  const outputItems = Array.isArray(parsed?.output) ? parsed.output : [];
  for (const item of outputItems) {
    if (Array.isArray(item?.content)) {
      for (const content of item.content) {
        if (typeof content?.text === 'string' && content.text.trim()) {
          return content.text.trim();
        }
      }
    }
  }

  return '';
}

function extractFunctionCalls(parsed: any): Array<{ name: string; arguments: string; callId: string }> {
  const outputItems = Array.isArray(parsed?.output) ? parsed.output : [];
  return outputItems
    .filter((item: any) => item?.type === 'function_call' && item?.name && item?.call_id)
    .map((item: any) => ({
      name: String(item.name),
      arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments || {}),
      callId: String(item.call_id)
    }));
}

function getTodayDateString(timeZone = 'America/Sao_Paulo'): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(new Date());
  const lookup = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${lookup('year')}-${lookup('month')}-${lookup('day')}`;
}

function buildSystemPrompt(todayDate: string): string {
  return [
    'Voce e o Operador do Zenit Cash Mobile.',
    'Seu trabalho nesta V1 e ajudar o usuario a registrar transacoes financeiras e responder consultas financeiras rapidas com objetividade.',
    'Sempre escolha mode = OPERATOR.',
    `Hoje e ${todayDate}. Se o usuario nao informar data, use ${todayDate} sem perguntar.`,
    'Se o usuario estiver consultando informacoes e nao registrando uma transacao, nao crie rascunho.',
    'Quando o usuario perguntar saldo total, visao geral de saldos ou como estao os saldos das contas, use get_financial_overview.',
    'Quando o usuario perguntar saldo de uma conta especifica, banco especifico ou cartao especifico, use search_accounts para localizar a conta correta e responder com o saldo encontrado.',
    'Quando o usuario perguntar sobre fatura atual, limite total, limite disponivel, limite usado ou situacao de um cartao de credito, use get_credit_card_overview.',
    'Quando o usuario perguntar o que vence hoje, nesta semana, nos proximos dias ou quanto ainda falta pagar ate o fim do mes, use get_due_obligations.',
    'Quando o usuario quiser registrar despesa, receita ou transferencia, use create_transaction_draft.',
    'Quando houver um rascunho pendente e o usuario disser "sim", "confirmado", "pode confirmar" ou equivalente, consulte get_pending_action e use confirm_pending_action.',
    'Quando houver um rascunho pendente e o usuario disser "cancele", "nao", "descarta" ou equivalente, consulte get_pending_action e use cancel_pending_action.',
    'Quando o usuario pedir para corrigir um rascunho pendente, primeiro consulte get_pending_action e depois use update_transaction_draft.',
    'Quando houver duvida sobre categoria, use search_categories antes de criar ou atualizar o rascunho.',
    'Ao buscar categoria, pense por conceito e nao apenas por string literal. Exemplos: "cabeleireiro" pode virar "salao de beleza" ou "beleza"; "posto" pode virar "combustivel"; "tennis", "roupa" ou "sapato" podem virar "vestuario" ou "moda".',
    'Se search_categories devolver candidatos plausiveis da empresa, escolha a melhor categoria disponivel sem exigir correspondencia textual exata, salvo ambiguidade real entre varias opcoes fortes.',
    'Quando houver duvida sobre conta, banco ou cartao, use search_accounts antes de criar ou atualizar o rascunho.',
    'Por padrao, nomes de banco como "Bradesco", "Nubank" ou "Itau" devem ser tratados como conta de disponibilidade. So use cartao de credito se o usuario indicar explicitamente cartao, credito, fatura ou parcelamento.',
    'Se a frase mencionar Pix, dinheiro, debito, conta corrente, saldo ou disponibilidade, prefira conta de disponibilidade (CHECKING, CASH ou SAVINGS), nao cartao de credito, salvo indicacao explicita de cartao.',
    'Pix e um meio de pagamento, nao um nome de conta. Se o usuario ja informou uma conta especifica, como "Bradesco", e disser que foi no Pix, use essa conta de disponibilidade e evite buscas redundantes como procurar conta por "Pix" ou mudar para CASH sem indicio explicito.',
    'Use get_recent_transactions apenas para contexto historico, nunca como substituto da busca direta por categorias ou contas.',
    'Nunca invente ids de contas, categorias ou valores.',
    'Em consultas financeiras, sempre prefira responder com dados retornados pelas tools e mencione o periodo considerado quando houver vencimentos.',
    'Por padrao, trate lancamentos como liquidados/efetivados (COMPLETED). Use PENDING apenas quando o usuario indicar claramente que ainda nao pagou, ainda nao recebeu ou que se trata de uma obrigacao futura.',
    'Se search_categories ou search_accounts devolverem um id exato, prefira usar esse id em create_transaction_draft ou update_transaction_draft.',
    'Se descricao, valor, tipo, conta e categoria ja estiverem razoavelmente resolvidos, crie ou atualize o rascunho no mesmo turno. So faca pergunta se algum campo critico continuar realmente ambiguo depois das tools.',
    'Nao termine um turno com frases como "vou criar", "criando", "vou registrar" ou "agora aguardando sua confirmacao" sem antes chamar create_transaction_draft ou update_transaction_draft quando esses dados ja estiverem disponiveis.',
    'So considere a transacao confirmada e gravada depois de confirm_pending_action retornar sucesso.',
    'Responda em portugues do Brasil, de forma curta e objetiva.'
  ].join(' ');
}

function buildConversationInput(messages: ConversationMessage[], todayDate: string) {
  const items = [
    {
      role: 'system',
      content: [{ type: 'input_text', text: buildSystemPrompt(todayDate) }]
    }
  ];

  for (const message of messages) {
    const role = message.role === 'USER' ? 'user' : 'assistant';
    const contentType = role === 'assistant' ? 'output_text' : 'input_text';

    items.push({
      role,
      content: [{ type: contentType, text: message.text }]
    });
  }

  return items;
}

async function requestResponsesApi(params: {
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
}): Promise<ResponsesApiResult> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: params.model,
      ...params.body
    })
  });

  const raw = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    raw,
    parsed: parseJsonSafe(raw),
    model: params.model
  };
}

export default class LlmRuntimeService {
  static async runOperatorTurn(params: {
    context: AssistantToolExecutionContext;
    conversation: ConversationMessage[];
  }): Promise<RunAssistantTurnResult> {
    const startedAt = Date.now();
    const todayDate = getTodayDateString();
    const credential = await OpenAiIntegrationService.getDecryptedCredential(params.context.companyId, true);
    const baseModel = resolveOpenAiModel(credential.model || DEFAULT_OPENAI_MODEL);
    let selectedModel = baseModel;
    let usedFallbackModel = false;
    let toolCallsCount = 0;
    const tools = ToolRegistryService.getToolsForMode(AssistantMode.OPERATOR);

    const performInitialRequest = async (model: string) =>
      requestResponsesApi({
        apiKey: credential.apiKey,
        model,
        body: {
          input: buildConversationInput(params.conversation, todayDate),
          tools
        }
      });

    let initialResponse = await performInitialRequest(selectedModel);

    if (
      !initialResponse.ok &&
      shouldRetryWithLegacyOpenAiModel(selectedModel, initialResponse.status, initialResponse.raw)
    ) {
      selectedModel = LEGACY_OPENAI_MODEL_FALLBACK;
      usedFallbackModel = true;
      initialResponse = await performInitialRequest(selectedModel);
    }

    if (!initialResponse.ok) {
      throw new Error(`Falha OpenAI (${initialResponse.status}): ${initialResponse.raw}`);
    }

    let latestPendingAction: ToolExecutionResult['pendingAction'];
    let currentResponse = initialResponse;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const functionCalls = extractFunctionCalls(currentResponse.parsed);
      if (functionCalls.length === 0) {
        const rawOutputText = extractOutputText(currentResponse.parsed);
        const finalPayload = finalAssistantPayloadSchema.safeParse(parseJsonSafe(rawOutputText));
        if (finalPayload.success) {
          return {
            mode: finalPayload.data.mode,
            message: finalPayload.data.message,
            pendingAction: latestPendingAction,
            telemetry: {
              model: selectedModel,
              promptVersion: credential.promptVersion,
              latencyMs: Date.now() - startedAt,
              toolCalls: toolCallsCount,
              usedFallbackModel: usedFallbackModel || undefined
            }
          };
        }

        const directMessage =
          rawOutputText || 'Nao consegui montar o rascunho. Pode reformular a mensagem?';
        return {
          mode: 'OPERATOR',
          message: directMessage,
          pendingAction: latestPendingAction,
          telemetry: {
            model: selectedModel,
            promptVersion: credential.promptVersion,
            latencyMs: Date.now() - startedAt,
            toolCalls: toolCallsCount,
            usedFallbackModel: usedFallbackModel || undefined
          }
        };
      }

      const toolOutputs = [];
      for (const functionCall of functionCalls) {
        toolCallsCount += 1;
        const parsedArguments = parseJsonSafe(functionCall.arguments) || {};

        try {
          const result = await ToolExecutorService.executeTool(
            functionCall.name,
            parsedArguments,
            params.context
          );
          if (result.pendingAction) {
            latestPendingAction = result.pendingAction;
          }

          await AssistantTraceService.recordToolTrace({
            turnId: params.context.turnId,
            userId: params.context.userId,
            companyId: params.context.companyId,
            toolName: functionCall.name,
            toolCallId: functionCall.callId,
            status: 'success',
            input: parsedArguments,
            output: result.data
          });

          toolOutputs.push({
            type: 'function_call_output',
            call_id: functionCall.callId,
            output: JSON.stringify(result.data)
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await AssistantTraceService.recordToolTrace({
            turnId: params.context.turnId,
            userId: params.context.userId,
            companyId: params.context.companyId,
            toolName: functionCall.name,
            toolCallId: functionCall.callId,
            status: 'error',
            input: parsedArguments,
            errorMessage: message
          });

          toolOutputs.push({
            type: 'function_call_output',
            call_id: functionCall.callId,
            output: JSON.stringify({
              ok: false,
              error: message
            })
          });
        }
      }

      currentResponse = await requestResponsesApi({
        apiKey: credential.apiKey,
        model: selectedModel,
        body: {
          previous_response_id: currentResponse.parsed?.id,
          input: toolOutputs,
          tools,
          text: {
            format: {
              type: 'json_schema',
              name: 'assistant_turn_final_response',
              strict: true,
              schema: FINAL_RESPONSE_JSON_SCHEMA
            }
          }
        }
      });

      if (!currentResponse.ok) {
        throw new Error(`Falha OpenAI (${currentResponse.status}): ${currentResponse.raw}`);
      }
    }

    throw new Error('A IA excedeu o limite de iteracoes de tools para este turno');
  }
}
