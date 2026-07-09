---
title: WhatsApp Meta webhook setup
slug: /docs/architecture/assistant/whatsapp-meta-webhook-setup
type: setup-guide
product: zenit-cash
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-28
summary: Guia operacional para configurar a app da Meta e conectar o webhook do WhatsApp Cloud API ao Zenit.
tags:
  - assistant
  - whatsapp
  - meta
  - webhook
related:
  - /docs/architecture/assistant/whatsapp-financial-channel-technical-spec
  - /docs/architecture/assistant/examples/whatsapp-transaction-draft-example
---

# WhatsApp Meta webhook setup

## Escopo

Este guia cobre a configuracao operacional do canal de WhatsApp ja implementado no Zenit Cash.

Rotas existentes no backend:

- `GET /api/webhooks/whatsapp`
- `POST /api/webhooks/whatsapp`
- `GET /api/integrations/whatsapp/status`
- `POST /api/integrations/whatsapp/challenge`
- `PUT /api/integrations/whatsapp/active-company`
- `POST /api/integrations/whatsapp/disconnect`

## Variaveis de ambiente

Backend:

- `WHATSAPP_API_VERSION`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_BUSINESS_PHONE_E164`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_BINDING_MESSAGE_PREFIX`
- `WHATSAPP_BINDING_CHALLENGE_TTL_MINUTES`
- `WEBHOOK_BASE_URL`

Exemplo de callback final esperado:

```env
WEBHOOK_BASE_URL="https://api.seu-dominio.com"
WHATSAPP_WEBHOOK_VERIFY_TOKEN="troque-por-um-segredo-forte"
```

Com isso, o callback configurado na Meta deve apontar para:

```text
https://api.seu-dominio.com/api/webhooks/whatsapp
```

## Passo a passo na Meta

1. Acesse a app da Meta for Developers usada pelo Zenit.
2. Adicione o produto `WhatsApp`.
3. Garanta que o numero oficial usado pelo canal esteja associado a essa app.
4. Copie o `Phone Number ID` e o `temporary/permanent access token` para as variaveis do backend.
5. Abra a area de `Webhooks` do produto WhatsApp.
6. Informe o `Callback URL` com `/api/webhooks/whatsapp`.
7. Informe em `Verify token` o mesmo valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
8. Salve e conclua a verificacao do callback.
9. Assine o campo `messages` do webhook do WhatsApp Business Account.

Observacoes importantes:

- o campo `messages` e o minimo necessario para o Zenit receber mensagens inbound e updates de status do mesmo fluxo;
- o backend valida `X-Hub-Signature-256`, entao `WHATSAPP_APP_SECRET` precisa bater com o `App Secret` real da app da Meta;
- o QR code do perfil depende de `WHATSAPP_BUSINESS_PHONE_E164`, porque o link usa `wa.me/<numero>`;
- sem `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`, o webhook pode ate receber eventos, mas o Zenit nao conseguira responder ao usuario.

## Checklist de configuracao

Antes de testar no Zenit, confirme:

- o callback `GET` retorna `hub.challenge`;
- o `POST` chega ao backend sem bloqueio de rede;
- `WHATSAPP_APP_SECRET` esta preenchido;
- `WHATSAPP_BUSINESS_PHONE_E164` contem apenas o numero do destino, em formato internacional;
- a empresa esta com entitlement ativo para `zenit-whatsapp`;
- o usuario esta com grant ativo para `zenit-whatsapp`.

## Fluxo de teste ponta a ponta

1. Suba backend e frontend com as variaveis preenchidas.
2. Habilite o canal em `Administracao > Configuracoes`.
3. Conceda o app `Zenit WhatsApp` ao usuario no cadastro administrativo.
4. Abra `Meu Perfil`.
5. Gere o QR Code.
6. Escaneie o QR e envie a mensagem pre-preenchida.
7. Aguarde a resposta de confirmacao do Zenit no WhatsApp.
8. Envie uma mensagem como `gastei 45 no cafe hoje`.
9. Confirme o rascunho respondendo `confirmar`.

## Onde o Zenit aplica seguranca

Toda mensagem recebida passa por:

1. resolucao de `waId -> binding`;
2. resolucao da empresa ativa do binding;
3. checagem de entitlement da empresa para `zenit-whatsapp`;
4. checagem de grant do usuario para `zenit-whatsapp`;
5. reconstrucao do contexto do usuario na empresa;
6. validacoes finas de conta, categoria e `pending action`.

## Referencias oficiais

- `https://developers.facebook.com/docs/whatsapp/cloud-api/get-started`
- `https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks`
- `https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages`
