-- Register the application key without granting access to existing companies/users.
ALTER TYPE "AppKey" ADD VALUE IF NOT EXISTS 'ZENIT_BIZZ';
