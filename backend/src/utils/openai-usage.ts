export type OpenAiUsage = {
  requests: number;
  reportedRequests: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export function createOpenAiUsage(): OpenAiUsage {
  return { requests: 0, reportedRequests: 0, inputTokens: 0, cachedInputTokens: 0,
    cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
}

export function accumulateOpenAiUsage(total: OpenAiUsage, usage: any): void {
  total.requests += 1;
  if (!usage || !Number.isInteger(usage.input_tokens) || !Number.isInteger(usage.output_tokens)) return;
  total.reportedRequests += 1;
  const count = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
  total.inputTokens += count(usage.input_tokens);
  total.cachedInputTokens += count(usage.input_tokens_details?.cached_tokens);
  total.cacheWriteTokens += count(usage.input_tokens_details?.cache_write_tokens);
  total.outputTokens += count(usage.output_tokens);
  total.reasoningTokens += count(usage.output_tokens_details?.reasoning_tokens);
  total.totalTokens += count(usage.total_tokens ?? (usage.input_tokens + usage.output_tokens));
}
