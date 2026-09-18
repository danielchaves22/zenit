import { Request, Response, NextFunction } from 'express';
import * as client from 'prom-client';

// 1) Coleta métricas padrão do Node.js (CPU, memória, event loop, GC, etc.).
client.collectDefaultMetrics({ prefix: 'zenit_core_' });

// 2) Histograma para duração das requisições HTTP
export const httpRequestDurationMs = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duração de cada request HTTP em milissegundos',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [50, 100, 300, 500, 1000, 2000, 5000]
});

// 3) Contador de erros por rota HTTP
export const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total de requisições que resultaram em erro (status >= 400)',
  labelNames: ['method', 'route', 'status_code'] as const
});

// 4) Métrica customizada: total de empresas criadas
export const companiesCreatedTotal = new client.Counter({
  name: 'companies_created_total',
  help: 'Número total de empresas criadas'
});

export const financialPlanningGuidanceRequestsTotal = new client.Counter({
  name: 'financial_planning_guidance_requests_total',
  help: 'Total de solicitações de parecer financeiro por IA e seu resultado',
  labelNames: ['model', 'prompt_version', 'outcome', 'fallback'] as const
});

export const financialPlanningGuidanceDurationMs = new client.Histogram({
  name: 'financial_planning_guidance_duration_ms',
  help: 'Duração total da geração e validação de pareceres financeiros por IA',
  labelNames: ['model', 'prompt_version', 'outcome', 'fallback'] as const,
  buckets: [250, 500, 1000, 2000, 5000, 10000, 20000, 40000]
});

export const financialPlanningGuidanceEvaluationScore = new client.Histogram({
  name: 'financial_planning_guidance_evaluation_score',
  help: 'Pontuação determinística dos pareceres financeiros avaliados',
  labelNames: ['model', 'prompt_version', 'outcome', 'fallback'] as const,
  buckets: [0, 50, 70, 85, 99, 100]
});

export const financialPlanningGuidanceTokensTotal = new client.Counter({
  name: 'financial_planning_guidance_tokens_total',
  help: 'Tokens consumidos na geração de pareceres financeiros por IA',
  labelNames: ['model', 'prompt_version', 'token_type'] as const
});

export type FinancialPlanningGuidanceOutcome =
  | 'success'
  | 'unavailable'
  | 'provider_error'
  | 'schema_invalid'
  | 'evaluation_invalid'
  | 'persistence_error';

export function observeFinancialPlanningGuidance(params: {
  model?: string;
  promptVersion: string;
  outcome: FinancialPlanningGuidanceOutcome;
  usedFallbackModel?: boolean;
  durationMs: number;
  evaluationScore?: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}) {
  const model = params.model || 'unavailable';
  const labels = {
    model,
    prompt_version: params.promptVersion,
    outcome: params.outcome,
    fallback: params.usedFallbackModel ? 'true' : 'false'
  };
  financialPlanningGuidanceRequestsTotal.inc(labels);
  financialPlanningGuidanceDurationMs.observe(labels, Math.max(0, params.durationMs));
  if (params.evaluationScore !== undefined) {
    financialPlanningGuidanceEvaluationScore.observe(labels, params.evaluationScore);
  }

  const tokenCounts = [
    ['input', params.inputTokens],
    ['output', params.outputTokens],
    ['total', params.totalTokens]
  ] as const;
  for (const [tokenType, value] of tokenCounts) {
    if (value !== null && value !== undefined && value >= 0) {
      financialPlanningGuidanceTokensTotal.inc(
        { model, prompt_version: params.promptVersion, token_type: tokenType },
        value
      );
    }
  }
}

/**
 * Middleware que inicia o timer e, ao finalizar a resposta, registra duração e erros.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const end = httpRequestDurationMs.startTimer();
  res.on('finish', () => {
    const route = req.route?.path || req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    end(labels);
    if (res.statusCode >= 400) {
      httpErrorsTotal.inc(labels);
    }
  });
  next();
}

/**
 * Endpoint /metrics que o Prometheus irá “scrapear”
 */
export async function metricsEndpoint(req: Request, res: Response) {
  try {
    res.set('Content-Type', client.register.contentType);
    // metrics() agora retorna Promise<string>, então aguardamos
    const metrics = await client.register.metrics();
    res.end(metrics);
  } catch (err: any) {
    res.status(500).end(`Erro ao coletar métricas: ${err.message}`);
  }
}
