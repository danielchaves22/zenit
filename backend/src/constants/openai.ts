export const DEFAULT_OPENAI_MODEL = 'gpt-5.4-nano';
export const LEGACY_OPENAI_MODEL_FALLBACK = 'gpt-4o-mini';

type OpenAiErrorResponse = {
  error?: {
    code?: string | null;
    param?: string | null;
    message?: string | null;
  };
};

export function resolveOpenAiModel(model?: string | null): string {
  return String(model || DEFAULT_OPENAI_MODEL).trim();
}

export function shouldRetryWithLegacyOpenAiModel(model: string, status: number, raw: string): boolean {
  if (model !== DEFAULT_OPENAI_MODEL || ![400, 404].includes(status)) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw) as OpenAiErrorResponse;
    const error = parsed.error;
    if (!error) return false;

    if (error.code === 'model_not_found' || error.param === 'model') {
      return true;
    }

    const message = String(error.message || '').toLowerCase();
    return message.includes('model') && (
      message.includes('not found') ||
      message.includes('does not exist') ||
      message.includes('do not have access') ||
      message.includes('unsupported')
    );
  } catch {
    const normalized = raw.toLowerCase();
    return normalized.includes('model') && (
      normalized.includes('not found') ||
      normalized.includes('does not exist') ||
      normalized.includes('do not have access') ||
      normalized.includes('unsupported')
    );
  }
}
