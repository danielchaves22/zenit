-- Preserve platform administrators from the legacy Equinox membership model.
-- App entitlements/grants alone never promote a user to platform administrator.
UPDATE "User" AS u
SET "role" = 'ADMIN'
WHERE EXISTS (
  SELECT 1 FROM "UserCompany" AS uc
  JOIN "Company" AS c ON c.id = uc."companyId"
  WHERE uc."userId" = u.id AND uc.role = 'ADMIN' AND c.code = 0
);

-- Company roles now describe business administration only. Global access lives on User.
UPDATE "UserCompany" SET "role" = 'SUPERUSER' WHERE "role" = 'ADMIN';
