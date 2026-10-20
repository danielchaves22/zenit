import { Router, Request, Response, NextFunction } from 'express';
import { AppKey, Prisma } from '@prisma/client';
import { z } from 'zod';
import ProductAttributeService from '../services/product-attribute.service';
import { BizzError } from '../services/bizz-error';
import {
  attributeListSchema,
  companyOptionsSchema,
  createAttributeSchema,
  updateAttributeSchema
} from '../validators/product-attribute.validator';

export function productAttributeRoutes(platform: boolean) {
  const router = Router();
  router.use((req, res, next) => {
    const allowed = platform
      ? req.user.platformAdmin && req.user.appKey === AppKey.ZENIT_ADMIN
      : req.user.appKey === AppKey.ZENIT_BIZZ &&
        Number.isSafeInteger(req.user.companyId) &&
        req.user.companyId! > 0;
    if (!allowed) return res.status(403).json({ error: 'Acesso negado a este cadastro.' });
    return next();
  });
  const scope = (req: Request) => (platform ? null : req.user.companyId!);
  const run =
    (action: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      void action(req, res).catch((error) => {
        if (error instanceof z.ZodError)
          return res.status(400).json({ error: error.errors[0]?.message });
        if (error instanceof BizzError)
          return res.status(error.status).json({ error: error.message });
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code)
        )
          return res
            .status(409)
            .json({
              error:
                'Cadastro duplicado ou alterado por outra pessoa. Confira os dados e tente novamente.'
            });
        return next(error);
      });
    };
  router.get(
    '/',
    run(async (req, res) =>
      res.json(await ProductAttributeService.list(scope(req), attributeListSchema.parse(req.query)))
    )
  );
  router.get(
    '/:id',
    run(async (req, res) =>
      res.json(
        await ProductAttributeService.get(scope(req), z.string().uuid().parse(req.params.id))
      )
    )
  );
  router.post(
    '/',
    run(async (req, res) =>
      res
        .status(201)
        .json(
          await ProductAttributeService.create(
            scope(req),
            req.user.userId,
            createAttributeSchema.parse(req.body)
          )
        )
    )
  );
  router.put(
    '/:id',
    run(async (req, res) =>
      res.json(
        await ProductAttributeService.update(
          scope(req),
          req.user.userId,
          z.string().uuid().parse(req.params.id),
          updateAttributeSchema.parse(req.body)
        )
      )
    )
  );
  if (!platform)
    router.put(
      '/:id/options',
      run(async (req, res) =>
        res.json(
          await ProductAttributeService.companyOptions(
            req.user.companyId!,
            z.string().uuid().parse(req.params.id),
            companyOptionsSchema.parse(req.body)
          )
        )
      )
    );
  return router;
}
