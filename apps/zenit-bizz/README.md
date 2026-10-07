# Zenit Bizz

Aplicação de gestão de pequenos negócios. Esta primeira versão contém login com a conta Zenit, troca de senha no primeiro acesso, seleção de empresa, clientes e fornecedores. Um contato pode exercer os dois papéis.

## Desenvolvimento

Na raiz do monorepo, com Node 22 e npm 10 ou superior:

```powershell
npm install
npm run build:backend
Copy-Item apps/zenit-bizz/.env.example apps/zenit-bizz/.env.local
```

Confira o `DATABASE_URL` do backend antes de aplicar as migrações ao ambiente local desejado. A nova aplicação exige as migrações `20261007100000_add_bizz_app` e `20261007101000_add_bizz_contacts`.

```powershell
npm --workspace backend run prisma:deploy
npm --workspace backend run dev
```

Em outro terminal:

```powershell
npm run dev:zenit-bizz
```

Frontend: http://localhost:3004. `BACKEND_URL` aponta para a origem do backend compartilhado, sem `/api`; seu padrão é http://127.0.0.1:3000. O Next encaminha `/api` pelo servidor. Configure a variável antes do build em outro ambiente.

## Liberação do acesso

1. No Zenit Admin, selecione a empresa e abra **Administração → Configurações**.
2. Habilite **Zenit Bizz nesta empresa** e salve.
3. Abra **Administração → Usuários**, edite a pessoa e conceda **Zenit Bizz** na empresa correspondente.
4. Entre no Bizz com as mesmas credenciais. Se necessário, troque a senha e selecione a empresa.

O formulário de concessão existente também está disponível no Cash e no Calc. `ADMIN` e `SUPERUSER` seguem as regras existentes de administração; ser administrador não substitui habilitação da empresa, vínculo e concessão individual. Bizz não é habilitado ou concedido automaticamente pelas migrações, nem incluído nas concessões padrão de novos usuários.

Mais detalhes: [acesso e cadastros](../../docs/products/zenit-bizz/foundation.md).

## Verificação

```powershell
npm run test:zenit-bizz
npm run build:zenit-bizz
node backend/scripts/run-jest.js integration --runInBand --runTestsByPath __tests__/integration/bizz-foundation.test.ts
```

O comando de integração usa a base de teste e a recria conforme o mecanismo do backend. Consulte o [guia de testes](../../docs/operations/testing/backend-local-integration-testing-guide.md) antes de executá-lo. Para compartilhar o ambiente com outras validações, use `TEST_DATABASE_URL` apontando para um banco/esquema de teste isolado.

## Limites desta versão

- Usuários com acesso efetivo ao Bizz podem consultar e manter clientes/fornecedores da empresa ativa. Permissões mais granulares de operação serão definidas com os próximos fluxos.
- Cadastro, edição, pesquisa, paginação, inativação e reativação estão disponíveis. Não há exclusão definitiva na interface/API.
- A identidade é compartilhada; login automático entre domínios diferentes não foi implementado.
- Compras, vendas, produção, estoque e geração de compromissos no Cash são etapas posteriores.
- Publicação e migrações em produção devem fazer parte de uma entrega própria. A aplicação pode ser publicada separadamente, usando build `npm run build:zenit-bizz` e start `npm --workspace apps/zenit-bizz run start`, com o backend na versão compatível.
