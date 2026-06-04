---
title: Zenit Cash Mobile setup
slug: /docs/operations/mobile/zenit-cash-mobile-setup
type: setup-guide
product: zenit-cash-mobile
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
summary: Setup local, pre-requisitos e roteiro de validacao da V1 do Zenit Cash Mobile.
tags:
  - mobile
  - setup
related:
  - /docs/architecture/mobile/zenit-cash-mobile-technical-spec
---

# Zenit Cash Mobile setup

## Objetivo

Registrar como preparar o ambiente local e validar a vertical slice inicial do `zenit-cash-mobile`.

## Pre-requisitos

- Node.js e npm instalados;
- dependencias do monorepo instaladas em `C:\\dev\\equinox\\zenit`;
- backend configurado com banco e credencial OpenAI por empresa;
- Expo CLI disponivel via workspace;
- dispositivo ou emulador Android/iOS funcional.

## Configuracao

- ajustar `EXPO_PUBLIC_API_URL` no app mobile;
- configurar autenticacao e empresa ativa no backend;
- garantir que o fluxo do assistente esteja acessivel no backend.

## Execucao

1. instalar dependencias do monorepo;
2. subir backend e banco;
3. executar o app com `npm --workspace apps/zenit-cash-mobile run start`;
4. abrir em emulador ou dispositivo;
5. autenticar e validar o bootstrap da ultima empresa ativa.

## Verificacao

Verificacoes minimas:

- login e reaproveitamento da ultima empresa valida;
- abertura da home minima;
- envio de mensagem no chat;
- recebimento de streaming SSE;
- criacao de `pending action`;
- confirmacao e cancelamento do rascunho.

## Troubleshooting

- validar conectividade entre app e backend;
- validar `EXPO_PUBLIC_API_URL`;
- validar headers `Authorization`, `X-App-Key` e `X-Company-Id`;
- validar que a empresa ativa possui configuracao OpenAI utilizavel.
