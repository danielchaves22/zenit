# Testes Integrados Locais

Este backend foi configurado para rodar a suíte de integração em um banco exclusivo de testes.

## Objetivo

- Evitar que os testes apontem para o banco de desenvolvimento normal.
- Resetar a base antes da suíte para garantir previsibilidade.
- Permitir execução local no Windows sem depender de sintaxe shell específica.

## Pré-requisitos

- PostgreSQL acessível localmente.
- Banco dedicado para testes, por exemplo `zenit_test`.
- Dependências instaladas com `npm install`.

Se ainda precisar criar o banco:

```sql
CREATE DATABASE zenit_test;
```

## Arquivos de ambiente

O arquivo local usado pelos testes é `backend/.env.test`.

Ele não é versionado. Para configurar uma nova máquina:

1. Copie `backend/.env.test.example` para `backend/.env.test`.
2. Ajuste o `DATABASE_URL` para o banco de teste.
3. Mantenha `REDIS_ENABLED=false` para reduzir dependências locais.

Exemplo:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/zenit_test?schema=public"
JWT_SECRET="test-secret-change-me"
NODE_ENV=test
```

## Regras de segurança

Antes de rodar a suíte integrada, o setup valida o `DATABASE_URL`.

Os testes só continuam se o nome do banco ou schema parecer de teste, por exemplo:

- `zenit_test`
- `app_test`
- `schema=test_local`

Se o `DATABASE_URL` não tiver marcador de teste, a execução falha de propósito.

## Fluxo da suíte integrada

`npm run test:integration` faz o seguinte:

1. Carrega `backend/.env.test`.
2. Força `NODE_ENV=test`.
3. Ignora rate limiting para evitar `429` artificiais durante a suíte.
4. Executa `prisma migrate reset --force --skip-seed --skip-generate`.
5. Roda os testes em `backend/__tests__/integration`.

Isso significa que o banco configurado em `.env.test` será apagado e recriado a cada execução da suíte.

## Scripts úteis

No diretório `backend`:

```bash
npm run test:unit
npm run test:integration
npm run test:integration:list
npm run test:integration:reset-db
npm run test:integration:migrate
```

## Observações

- `test:unit` não reseta o banco.
- `test:integration` deve apontar somente para a base de testes.
- `test:integration:list` apenas lista os arquivos e não toca no banco.
- A suíte atual roda com `--runInBand` porque ainda há compartilhamento de estado entre arquivos.
- Se novas integrações exigirem segredos específicos, adicione-os somente em `.env.test`, nunca em `.env.example`.
