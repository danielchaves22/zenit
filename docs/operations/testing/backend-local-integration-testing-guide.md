---
title: Backend local integration testing
slug: /docs/operations/testing/backend-local-integration-testing
type: testing-guide
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
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

Fluxo basico:

- copiar `backend/.env.test.example` para `backend/.env.test`;
- ajustar `DATABASE_URL`;
- rodar os scripts de teste integrados do backend.

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
