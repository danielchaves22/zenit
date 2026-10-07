import { Router, Request, Response, NextFunction } from 'express';
import { AppKey } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import BizzContactService, { BizzError } from '../services/bizz-contact.service';
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
      if (error instanceof BizzError) return res.status(error.status).json({ error: error.message });
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
        return res
          .status(403)
          .json({ error: 'Altere sua senha antes de continuar.', code: 'PASSWORD_CHANGE_REQUIRED' });
      return next();
    })
    .catch(next);
});
router.get(
  '/contacts',
  run(async (req, res) =>
    res.json(await BizzContactService.list(req.user.companyId!, bizzContactListSchema.parse(req.query)))
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
export default router;
