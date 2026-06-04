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

function buildSystemPrompt(): string {
  return [
    'Voce e o Operador do Zenit Cash Mobile.',
    'Seu trabalho nesta V1 e ajudar o usuario a registrar transacoes financeiras com rapidez e seguranca.',
    'Sempre escolha mode = OPERATOR.',
    'Quando o usuario quiser registrar despesa, receita ou transferencia, use create_transaction_draft.',
    'Nunca invente ids de contas, categorias ou valores.',
    'Se faltar dado critico para criar o rascunho, use o resultado da tool para responder pedindo apenas o minimo necessario.',
    'Nao confirme uma transacao como gravada. O que existe nesta etapa e um rascunho aguardando confirmacao humana.',
    'Responda em portugues do Brasil, de forma curta e objetiva.'
  ].join(' ');
}

function buildConversationInput(messages: ConversationMessage[]) {
  const items = [
    {
      role: 'system',
      content: [{ type: 'input_text', text: buildSystemPrompt() }]
    }
  ];

  for (const message of messages) {
    const role =
      message.role === 'USER'
        ? 'user'
        : 'assistant';
    items.push({
      role,
      content: [{ type: 'input_text', text: message.text }]
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
    const credential = await OpenAiIntegrationService.getDecryptedCredential(params.context.companyId, true);
    const baseModel = resolveOpenAiModel(credential.model || DEFAULT_OPENAI_MODEL);
    let selectedModel = baseModel;
    let usedFallbackModel = false;
    let toolCallsCount = 0;

    const performInitialRequest = async (model: string) =>
      requestResponsesApi({
        apiKey: credential.apiKey,
        model,
        body: {
          input: buildConversationInput(params.conversation),
          tools: ToolRegistryService.getToolsForMode(AssistantMode.OPERATOR)
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

    const functionCalls = extractFunctionCalls(initialResponse.parsed);
    if (functionCalls.length === 0) {
      const directMessage = extractOutputText(initialResponse.parsed) || 'Nao consegui montar o rascunho. Pode reformular a mensagem?';
      return {
        mode: 'OPERATOR',
        message: directMessage,
        telemetry: {
          model: selectedModel,
          promptVersion: credential.promptVersion,
          latencyMs: Date.now() - startedAt,
          toolCalls: 0,
          usedFallbackModel: usedFallbackModel || undefined
        }
      };
    }

    let latestPendingAction: ToolExecutionResult['pendingAction'];
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

    const finalResponse = await requestResponsesApi({
      apiKey: credential.apiKey,
      model: selectedModel,
      body: {
        previous_response_id: initialResponse.parsed?.id,
        input: toolOutputs,
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

    if (!finalResponse.ok) {
      throw new Error(`Falha OpenAI (${finalResponse.status}): ${finalResponse.raw}`);
    }

    const finalPayload = finalAssistantPayloadSchema.safeParse(parseJsonSafe(extractOutputText(finalResponse.parsed)));
    if (!finalPayload.success) {
      throw new Error('Resposta final da IA em formato invalido');
    }

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
}
