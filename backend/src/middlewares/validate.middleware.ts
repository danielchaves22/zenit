import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';

export function validate(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const toValidate = {
      ...req.body,
      ...(Object.keys(req.params).length ? req.params : {}),
      ...(Object.keys(req.query).length ? req.query : {})
    };
    const result = schema.safeParse(toValidate);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message
      }));
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    // Substitui req.body pelos dados parsed
    req.body = result.data;
    next();
  };
}
