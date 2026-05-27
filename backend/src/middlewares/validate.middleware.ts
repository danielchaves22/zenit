import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';

type ValidationSource = 'body' | 'params' | 'query';

type ValidationOptions = {
  source?: ValidationSource | ValidationSource[];
};

const MERGE_PRECEDENCE: ValidationSource[] = ['body', 'params', 'query'];
const OWNERSHIP_PRECEDENCE: ValidationSource[] = ['params', 'query', 'body'];

function normalizeSources(req: Request, options?: ValidationOptions): ValidationSource[] {
  if (options?.source) {
    return Array.isArray(options.source) ? options.source : [options.source];
  }

  switch (req.method.toUpperCase()) {
    case 'GET':
    case 'HEAD':
    case 'DELETE':
      return ['params', 'query'];
    default:
      return ['body', 'params', 'query'];
  }
}

function asPlainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

function buildValidationPayload(
  req: Request,
  sources: ValidationSource[]
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const source of MERGE_PRECEDENCE) {
    if (!sources.includes(source)) {
      continue;
    }

    Object.assign(payload, asPlainObject(req[source]));
  }

  return payload;
}

function assignParsedData(
  req: Request,
  parsedData: Record<string, unknown>,
  sources: ValidationSource[]
): void {
  const originalBySource = {
    body: asPlainObject(req.body),
    params: asPlainObject(req.params),
    query: asPlainObject(req.query)
  };

  const nextBySource: Record<ValidationSource, Record<string, unknown>> = {
    body: sources.includes('body') ? {} : originalBySource.body,
    params: originalBySource.params,
    query: originalBySource.query
  };

  const fallbackSource: ValidationSource =
    sources.length === 1
      ? sources[0]
      : sources.includes('body')
        ? 'body'
        : sources.includes('query')
          ? 'query'
          : 'params';

  for (const [key, value] of Object.entries(parsedData)) {
    const targetSource =
      OWNERSHIP_PRECEDENCE.find(
        (source) => sources.includes(source) && Object.prototype.hasOwnProperty.call(originalBySource[source], key)
      ) ?? fallbackSource;

    nextBySource[targetSource][key] = value;
  }

  for (const source of sources) {
    req[source] = nextBySource[source] as Request[typeof source];
  }
}

export function validate(schema: ZodTypeAny, options?: ValidationOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const sources = normalizeSources(req, options);
    const result = schema.safeParse(buildValidationPayload(req, sources));

    if (!result.success) {
      const errors = result.error.errors.map((error) => ({
        field: error.path.join('.'),
        message: error.message
      }));

      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    assignParsedData(req, result.data as Record<string, unknown>, sources);
    return next();
  };
}
