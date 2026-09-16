---
title: Backend local integration testing
slug: /docs/operations/testing/backend-local-integration-testing
type: testing-guide
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-09-16
summary: Guia para preparar banco dedicado e rodar testes de integracao locais do backend.
tags:
  - backend
  - testing
related:
  - /docs/operations/mobile/zenit-cash-mobile-setup
---

# Backend local integration testing

## Objetivo

Definir como preparar e executar a suite local de testes integrados do backend sem apontar para o banco de desenvolvimento normal.

## Escopo

Esta pagina cobre pre-requisitos, configuracao de ambiente e cuidados basicos para execucao local dos testes integrados.

## Pre-requisitos

- PostgreSQL acessivel localmente;
- banco dedicado para testes, como `zenit_test`;
- dependencias instaladas com `npm install`;
- arquivo `backend/.env.test` configurado.

## Comandos

Validacao sem dependencia do PostgreSQL:

```powershell
npm run verify:static
```

Validacao completa, incluindo reset do banco de teste e build do Zenit Cash:

```powershell
npm run verify
```

Fluxo de preparacao do banco:

- copiar `backend/.env.test.example` para `backend/.env.test`;
- ajustar `DATABASE_URL`;
- iniciar o PostgreSQL ou o Docker Desktop usado pelo ambiente local;
- confirmar a disponibilidade com `docker compose ps`, quando aplicavel;
- rodar `npm --workspace backend run test:integration`.

No Windows, nao executar `prisma generate` ou o build do backend em paralelo com
Jest. Os testes podem manter o engine nativo do Prisma aberto, impedindo a troca
atomica da DLL durante a geracao. O script `verify` executa essas etapas em
sequencia.

## Limite de conexoes no ambiente de teste

O carregador de `.env.test` acrescenta `connection_limit=5` ao `DATABASE_URL`
quando a URL nao define um limite explicito. O valor pode ser alterado com
`TEST_DATABASE_CONNECTION_LIMIT`.

Esse limite existe somente no processo de testes. A aplicacao usa uma unica
instancia compartilhada do Prisma Client; o limite funciona como protecao
adicional para essa instancia, para os clientes criados pelas proprias suites e
para os cenarios de estresse concorrente. Ele evita que o PostgreSQL local seja
esgotado e provoque falhas em cascata nas suites seguintes, mas nao deve ser
copiado automaticamente para producao.

## Cenarios de teste

- reset previsivel da base antes da suite;
- execucao segura sem afetar o banco de desenvolvimento;
- validacao de fluxos de integracao do backend.

## Criterios de sucesso

- a suite executa contra o banco dedicado;
- o ambiente de desenvolvimento normal nao e afetado;
- os testes conseguem recriar estado previsivel antes da execucao.

## Troubleshooting

- validar conexao com PostgreSQL;
- confirmar o caminho e o conteudo de `backend/.env.test`;
- garantir que a base de testes exista e esteja acessivel.
- se `docker compose ps` falhar ao abrir `dockerDesktopLinuxEngine`, iniciar o
  Docker Desktop antes de repetir a suite;
- se `prisma generate` falhar com `EPERM` ao renomear o query engine, encerrar a
  suite Jest concorrente e repetir build e testes sequencialmente.
