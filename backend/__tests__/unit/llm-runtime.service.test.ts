jest.mock('../../src/services/openai-integration.service', () => ({ __esModule: true, default: { getDecryptedCredential: jest.fn() } }));
jest.mock('../../src/services/tool-registry.service', () => ({ __esModule: true, default: { getToolsForMode: jest.fn(() => []) } }));
jest.mock('../../src/services/tool-executor.service', () => ({ __esModule: true, default: { executeTool: jest.fn() } }));
jest.mock('../../src/services/assistant-trace.service', () => ({ __esModule: true, default: { recordToolTrace: jest.fn() } }));

import LlmRuntimeService from '../../src/services/llm-runtime.service';
import Integration from '../../src/services/openai-integration.service';
import Executor from '../../src/services/tool-executor.service';
import { getOpenAiChatOptions, getOpenAiResponsesOptions } from '../../src/constants/openai';

const context = { sessionId: 1, turnId: 2, userId: 3, companyId: 4, role: 'ADMIN', mode: 'OPERATOR' } as const;
const usage = (input: number, output: number, cached = 0, writes = 0) => ({
  input_tokens: input, output_tokens: output, total_tokens: input + output,
  input_tokens_details: { cached_tokens: cached, cache_write_tokens: writes }, output_tokens_details: { reasoning_tokens: 0 }
});
const reply = (body: unknown, status = 200) => ({ ok: status === 200, status, text: async () => JSON.stringify(body) }) as Response;
const final = { id: 'resp.final', output_text: '{"mode":"OPERATOR","message":"Pronto."}' };

describe('Explicit economical reasoning and whole-turn usage', () => {
  afterEach(() => jest.restoreAllMocks());
  beforeEach(() => {
    jest.mocked(Integration.getDecryptedCredential).mockResolvedValue({ apiKey: 'test-key', model: 'gpt-6-luna', promptVersion: 'v1' } as any);
    jest.mocked(Executor.executeTool).mockResolvedValue({ data: { ok: true } });
  });

  it('uses none on the initial request and tool continuation and sums all usage', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(reply({ id: 'resp.first', usage: usage(100, 12, 20, 30), output: [
        { type: 'function_call', name: 'search_accounts', call_id: 'call1', arguments: '{}' }
      ] }))
      .mockResolvedValueOnce(reply({ ...final, usage: usage(160, 8, 80) }));
    const result = await LlmRuntimeService.runOperatorTurn({ context, conversation: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchMock.mock.calls) {
      expect(JSON.parse(String(options?.body))).toMatchObject({ model: 'gpt-6-luna', reasoning: { effort: 'none' } });
    }
    expect(result.telemetry).toMatchObject({ reasoningEffort: 'none', toolCalls: 1, usage: {
      requests: 2, reportedRequests: 2, inputTokens: 260, outputTokens: 20, cachedInputTokens: 100,
      cacheWriteTokens: 30, reasoningTokens: 0, totalTokens: 280
    } });
  });

  it('keeps the legacy fallback free of unsupported reasoning parameters', async () => {
    jest.mocked(Integration.getDecryptedCredential).mockResolvedValue({ apiKey: 'test-key', model: 'gpt-5.4-nano', promptVersion: 'v1' } as any);
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(reply({ error: { code: 'model_not_found' } }, 404))
      .mockResolvedValueOnce(reply({ ...final, usage: usage(20, 6) }));
    const result = await LlmRuntimeService.runOperatorTurn({ context, conversation: [] });
    const fallback = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(fallback.model).toBe('gpt-4o-mini');
    expect(fallback).not.toHaveProperty('reasoning');
    expect(result.telemetry).toMatchObject({ model: 'gpt-4o-mini', usedFallbackModel: true,
      usage: { requests: 2, reportedRequests: 1, totalTokens: 26 } });
    expect(result.telemetry.reasoningEffort).toBeUndefined();
  });

  it('distinguishes missing usage from a reported zero-token request', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(reply(final));
    const result = await LlmRuntimeService.runOperatorTurn({ context, conversation: [] });
    expect(result.telemetry.usage).toMatchObject({ requests: 1, reportedRequests: 0, totalTokens: 0 });
  });

  it('applies the correct endpoint shape only to the targeted models and snapshots', () => {
    expect(getOpenAiChatOptions('gpt-6-luna')).toEqual({ reasoning_effort: 'none' });
    expect(getOpenAiResponsesOptions('gpt-5.4-nano-2026-03-17')).toEqual({ reasoning: { effort: 'none' } });
    expect(getOpenAiResponsesOptions('gpt-4o-mini')).toEqual({});
    expect(getOpenAiChatOptions('gpt-6-astra')).toEqual({});
  });
});
