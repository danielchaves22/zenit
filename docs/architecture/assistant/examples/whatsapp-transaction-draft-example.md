---
title: WhatsApp transaction draft example
slug: /docs/architecture/assistant/examples/whatsapp-transaction-draft
type: example
product: zenit-cash
audience: dev
visibility: internal
status: draft
owner: engineering
last_reviewed: 2026-06-27
summary: Fluxo alvo de criacao e confirmacao de rascunho financeiro pelo canal WhatsApp.
tags:
  - assistant
  - whatsapp
  - operator
related:
  - /docs/architecture/assistant/whatsapp-financial-channel-technical-spec
  - /docs/architecture/assistant/assistant-runtime-architecture-note
---

# WhatsApp transaction draft example

## Cenario

Pre-condicoes:

- o usuario ja concluiu o fluxo de vinculacao `QR-first` entre a conta do Zenit e seu numero no WhatsApp;
- existe um unico binding ativo entre esse `waId` e o usuario;
- a empresa ativa do canal ja foi definida no onboarding ou no painel web;
- a empresa e o usuario continuam com grant ativo para `zenit-whatsapp`.

Mensagem do usuario no WhatsApp: `gastei 120 no posto hoje no nubank`.

## Atores envolvidos

- usuario;
- WhatsApp client;
- Meta Webhooks;
- webhook publico do Zenit;
- bridge de canal do WhatsApp;
- assistente operador;
- servicos financeiros de dominio.

## Entrada

A Meta chama `POST /api/webhooks/whatsapp` com um payload de mensagem inbound.

## Fluxo passo a passo

1. o webhook valida `X-Hub-Signature-256`;
2. o backend deduplica o `metaMessageId`;
3. o backend resolve o `WhatsAppUserBinding`;
4. o backend resolve a empresa ativa do binding e revalida grant + tenant + permissoes;
5. o backend obtem ou cria a `WhatsAppConversation`;
6. o backend obtem ou cria a `AssistantSession`;
7. o backend chama `AssistantOrchestratorService.processTurn(...)` com a mensagem textual;
8. o runtime pede `create_transaction_draft`;
9. o backend resolve conta, categoria, valor e data;
10. o backend cria uma `pending action`;
11. o bridge de canal transforma `message.completed` e `pending_action.created` em saida WhatsApp;
12. o backend envia um resumo com botoes `Confirmar` e `Cancelar`;
13. o usuario toca em `Confirmar`;
14. a Meta envia um evento de reply interativo para o mesmo webhook;
15. o backend extrai `pendingActionId` do `reply.id`;
16. o backend chama `PendingActionService.confirmTransactionDraft(...)`;
17. a transacao e gravada;
18. o backend envia a confirmacao final pelo WhatsApp.

## Payloads e eventos

### Mensagem inbound normalizada

```json
{
  "channel": "WHATSAPP",
  "waId": "5511999999999",
  "phoneNumber": "5511999999999",
  "profileName": "Leonardo",
  "metaMessageId": "wamid.HBgNNTUxMTk5OTk5OTk5ORUCABEYEj...",
  "timestamp": "2026-06-27T14:03:10.000Z",
  "messageKind": "text",
  "text": "gastei 120 no posto hoje no nubank"
}
```

### Reply button enviado ao usuario

```json
{
  "kind": "pending_action_summary",
  "pendingActionId": 381,
  "body": "Rascunho de despesa\\nR$ 120,00\\nDescricao: Posto\\nConta: Nubank\\nData: 2026-06-27",
  "buttons": [
    {
      "id": "pa:381:confirm",
      "title": "Confirmar"
    },
    {
      "id": "pa:381:cancel",
      "title": "Cancelar"
    }
  ]
}
```

### Reply recebido quando o usuario confirma

```json
{
  "channel": "WHATSAPP",
  "waId": "5511999999999",
  "metaMessageId": "wamid.HBgNNTUxMTk5OTk5OTk5ORUCABIY...",
  "messageKind": "button_reply",
  "text": "Confirmar",
  "interactiveReply": {
    "kind": "button",
    "id": "pa:381:confirm",
    "title": "Confirmar"
  }
}
```

### Eventos do assistente relevantes para o canal

- `turn.started`
- `message.completed`
- `pending_action.created`
- `turn.completed`

O canal WhatsApp ignora `message.delta` porque nao precisa de streaming token a token.

## Resultado esperado

O usuario consegue registrar o lancamento sem abrir app mobile dedicado. O backend continua sendo a unica camada que:

- interpreta a intencao com tools;
- resolve conta, categoria e data;
- cria a `pending action`;
- confirma a escrita financeira.

## Observacoes

- a vinculacao inicial do usuario deve acontecer por QR code, com deep link e e-mail apenas como apoios;
- o binding ativo do WhatsApp deve ser unico por usuario e por `waId`;
- a conversa do WhatsApp nao deve escrever direto no banco;
- o payload interativo deve carregar um identificador suficiente para localizar a `pending action`;
- o canal e adequado para captura rapida, nao para fluxos administrativos longos.
