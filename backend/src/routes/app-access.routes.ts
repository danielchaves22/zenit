import { Router } from 'express'
import {
  getAppCatalog,
  getCompanyEntitlementsById,
  getCurrentCompanyEntitlements,
  getCurrentEffectiveAccess,
  getUserAppGrants,
  updateCurrentCompanyEntitlements,
  updateUserAppGrants
} from '../controllers/app-access.controller'
import { validate } from '../middlewares/validate.middleware'
import { companyEntitlementSchema, userGrantSchema } from '../validators/app-access.validator'

const router = Router()

router.get('/catalog', getAppCatalog)
router.get('/effective', getCurrentEffectiveAccess)
router.get('/company/entitlements', getCurrentCompanyEntitlements)
router.get('/company/:companyId/entitlements', getCompanyEntitlementsById)
router.put('/company/entitlements', validate(companyEntitlementSchema), updateCurrentCompanyEntitlements)
router.get('/users/:id/grants', getUserAppGrants)
router.put('/users/:id/grants', validate(userGrantSchema), updateUserAppGrants)

export default router
