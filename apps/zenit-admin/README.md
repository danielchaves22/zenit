# Zenit Admin

Administração da plataforma Zenit: empresas, usuários, aplicativos disponíveis por empresa e serviços compartilhados.

## Acesso

- O acesso ao Admin depende do perfil global `User.role = ADMIN`, exposto na sessão como `platformAdmin`.
- Em **Administração → Usuários**, o controle **Acesso à plataforma → Administrador do Zenit** concede esse perfil. Somente outro administrador do Zenit pode alterá-lo. Não é permitido remover o próprio acesso nem excluir a própria conta.
- Um administrador pode acessar o Admin sem vínculo com empresas. Não existe empresa ativa ou seletor de empresa nessa aplicação.
- Em **Administração → Empresas**, selecione Cash, Calc, Bizz e demais aplicativos comerciais. Admin não participa dessa lista nem dos grants por empresa.
- Os aplicativos comerciais continuam exigindo vínculo com a empresa, aplicativo habilitado e permissão individual. O perfil global não substitui essas permissões.
- As configurações que pertencem a uma empresa identificam explicitamente a empresa de destino. O canal `X-App-Key: zenit-admin` permite apenas rotas de administração; não abre os módulos operacionais do Cash ou do Bizz.

## Compatibilidade e publicação

A migração `20261008190000_platform_admin_access` preserva os perfis globais ADMIN existentes e promove os administradores legados vinculados à empresa Equinox (código 0). Os antigos perfis ADMIN em `UserCompany` tornam-se SUPERUSER; somente o perfil global concede administração da plataforma. Entitlements e grants antigos do Admin permanecem armazenados, mas deixam de autorizar acesso.

Publique backend e Admin juntos. O backend deve executar as migrações com `prisma migrate deploy` antes de iniciar a nova versão. Uma reversão dessa mudança exige considerar também a migração dos perfis; não basta reverter o frontend.

## Desenvolvimento e validação

Na raiz do monorepo:

```powershell
npm --workspace apps/zenit-admin run dev
npm run build:zenit-admin
node backend/scripts/run-jest.js integration --runInBand __tests__/integration/platform-admin.test.ts __tests__/integration/company.test.ts __tests__/integration/user.test.ts __tests__/integration/bizz-foundation.test.ts __tests__/integration/auth.test.ts
```

Os testes usam uma [base dedicada](../../docs/operations/testing/backend-local-integration-testing-guide.md). Nunca execute o reset da suíte na base de produção.
