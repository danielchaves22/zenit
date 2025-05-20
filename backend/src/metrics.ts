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
