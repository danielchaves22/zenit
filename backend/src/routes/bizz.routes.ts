import { Router, Request, Response, NextFunction } from 'express';
import { AppKey, Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import BizzContactService from '../services/bizz-contact.service';
import GeographyService from '../services/geography.service';
import PostalCodeService from '../services/postal-code.service';
import BizzCatalogService from '../services/bizz-catalog.service';
import BizzPurchaseService from '../services/bizz-purchase.service';
import {
  bizzPurchaseListSchema,
  createBizzPurchaseSchema,
  settleBizzPurchaseSchema
} from '../validators/bizz-purchase.validator';
import { BizzError } from '../services/bizz-error';
import {
  bizzCatalogListSchema,
  createBizzCatalogSchema,
  updateBizzCatalogSchema
} from '../validators/bizz-catalog.validator';
import {
  bizzContactListSchema,
  createBizzContactSchema,
  updateBizzContactSchema
} from '../validators/bizz-contact.validator';

const router = Router();
router.use((req, res, next) => {
  if (req.user.appKey !== AppKey.ZENIT_BIZZ)
    return res.status(403).json({ error: 'Esta operação exige acesso ao Zenit Bizz.' });
  return next();
});
const run =
  (action: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void action(req, res).catch((error) => {
      if (error instanceof z.ZodError)
        return res.status(400).json({ error: error.errors[0]?.message || 'Dados inválidos.' });
      if (error instanceof BizzError)
        return res.status(error.status).json({ error: error.message });
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || (error.code === 'P2010' && error.meta?.code === '55P03'))
      )
        return res
          .status(409)
          .json({ error: 'Outra operação está usando estes dados. Atualize e tente novamente.' });
      return next(error);
    });
  };

router.get(
  '/session',
  run(async (req, res) => {
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: req.user.companyId },
      select: { id: true, name: true }
    });
    return res.json({ company, appKey: 'zenit-bizz' });
  })
);

router.use((req, res, next) => {
  void prisma.user
    .findUnique({ where: { id: req.user.userId }, select: { mustChangePassword: true } })
    .then((user) => {
      if (!user) return res.status(401).json({ error: 'Sessão inválida.' });
      if (user.mustChangePassword)
        return res.status(403).json({
          error: 'Altere sua senha antes de continuar.',
          code: 'PASSWORD_CHANGE_REQUIRED'
        });
      return next();
    })
    .catch(next);
});
router.get('/geography/states', (_req, res) => res.json(GeographyService.states()));
router.get('/geography/states/:uf/cities', (req, res) => {
  const cities = GeographyService.cities(req.params.uf);
  return cities ? res.json(cities) : res.status(400).json({ error: 'Selecione um estado válido.' });
});
router.get(
  '/geography/postal-codes/:cep',
  run(async (req, res) => res.json(await PostalCodeService.lookup(req.params.cep)))
);
router.get(
  '/contacts',
  run(async (req, res) =>
    res.json(
      await BizzContactService.list(req.user.companyId!, bizzContactListSchema.parse(req.query))
    )
  )
);
router.get(
  '/contacts/:id',
  run(async (req, res) =>
    res.json(
      await BizzContactService.get(req.user.companyId!, z.string().uuid().parse(req.params.id))
    )
  )
);
router.post(
  '/contacts',
  run(async (req, res) => {
    const result = await BizzContactService.create(
      req.user.companyId!,
      req.user.userId,
      createBizzContactSchema.parse(req.body)
    );
    return res.status(result.created ? 201 : 200).json(result.contact);
  })
);
router.put(
  '/contacts/:id',
  run(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    return res.json(
      await BizzContactService.update(
        req.user.companyId!,
        req.user.userId,
        id,
        updateBizzContactSchema.parse(req.body)
      )
    );
  })
);
router.get(
  '/catalog',
  run(async (req, res) =>
    res.json(
      await BizzCatalogService.list(req.user.companyId!, bizzCatalogListSchema.parse(req.query))
    )
  )
);
router.get(
  '/catalog/:id',
  run(async (req, res) =>
    res.json(
      await BizzCatalogService.get(req.user.companyId!, z.string().uuid().parse(req.params.id))
    )
  )
);
router.post(
  '/catalog',
  run(async (req, res) => {
    const result = await BizzCatalogService.create(
      req.user.companyId!,
      req.user.userId,
      createBizzCatalogSchema.parse(req.body)
    );
    return res.status(result.created ? 201 : 200).json(result.item);
  })
);
router.put(
  '/catalog/:id',
  run(async (req, res) =>
    res.json(
      await BizzCatalogService.update(
        req.user.companyId!,
        req.user.userId,
        z.string().uuid().parse(req.params.id),
        updateBizzCatalogSchema.parse(req.body)
      )
    )
  )
);
const actor = (req: Request) => ({ companyId: req.user.companyId!, userId: req.user.userId });
router.get(
  '/purchases/options',
  run(async (req, res) => res.json(await BizzPurchaseService.options(actor(req))))
);
router.get(
  '/purchases',
  run(async (req, res) =>
    res.json(await BizzPurchaseService.list(actor(req), bizzPurchaseListSchema.parse(req.query)))
  )
);
router.get(
  '/purchases/:id',
  run(async (req, res) =>
    res.json(await BizzPurchaseService.get(actor(req), z.string().uuid().parse(req.params.id)))
  )
);
router.post(
  '/purchases',
  run(async (req, res) => {
    const result = await BizzPurchaseService.create(
      actor(req),
      createBizzPurchaseSchema.parse(req.body)
    );
    return res.status(result.created ? 201 : 200).json(result.purchase);
  })
);
router.post(
  '/purchases/:id/installments/:transactionId/settle',
  run(async (req, res) =>
    res.json(
      await BizzPurchaseService.settle(
        actor(req),
        z.string().uuid().parse(req.params.id),
        z.coerce.number().int().positive().parse(req.params.transactionId),
        settleBizzPurchaseSchema.parse(req.body)
      )
    )
  )
);
router.post(
  '/purchases/:id/cancel',
  run(async (req, res) =>
    res.json(await BizzPurchaseService.cancel(actor(req), z.string().uuid().parse(req.params.id)))
  )
);
export default router;
