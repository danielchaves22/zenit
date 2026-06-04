---
title: Gmail OAuth setup
slug: /docs/integrations/gmail/gmail-oauth-setup
type: setup-guide
audience: ops
visibility: restricted
status: active
owner: ops
last_reviewed: 2026-06-04
summary: Passo a passo para configurar Google OAuth e Gmail API no ecossistema Zenit.
tags:
  - gmail
  - oauth
  - integrations
related:
  - /docs/operations/site/zenitapp-public-site-setup
---

# Gmail OAuth setup

## Objetivo

Registrar o passo a passo para configurar a integracao Gmail no ecossistema Zenit usando a conta Google correta, o dominio verificado e os redirects esperados pelo backend.

## Pre-requisitos

- conta Google com permissao adequada no projeto GCP;
- dominio `zenitapp.net` verificado no Search Console;
- backend com dominio ou URL publica estavel;
- acesso as variaveis de ambiente do backend e do frontend.

## Configuracao

1. usar a conta Google correta para o projeto GCP;
2. criar ou selecionar o projeto no Google Cloud;
3. verificar o dominio `zenitapp.net` no Search Console;
4. configurar a OAuth Consent Screen com homepage, privacy, terms e dominio autorizado;
5. ativar a Gmail API;
6. criar um OAuth Client ID do tipo `Web application`;
7. registrar o redirect URI do backend;
8. configurar variaveis de ambiente como `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REDIRECT_URI` e `INTEGRATION_SECRETS_MASTER_KEY`.

## Execucao

Depois da configuracao no Google Cloud e no ambiente:

1. publicar backend e frontend;
2. autenticar como usuario com permissao adequada;
3. abrir a area de configuracao da empresa para Gmail;
4. iniciar o fluxo OAuth;
5. confirmar o retorno com o estado de conexao;
6. executar a sincronizacao inicial.

## Verificacao

- o redirect retorna ao frontend esperado;
- o backend recebe e troca o codigo OAuth corretamente;
- o estado de conexao da integracao passa a refletir a conexao ativa;
- a sincronizacao Gmail executa sem erro de credenciais.

## Troubleshooting

- validar se o redirect URI no Google Cloud bate exatamente com o usado pelo backend;
- validar se o dominio autorizado inclui `zenitapp.net`;
- revisar se o usuario de teste foi adicionado quando o app OAuth estiver em modo `Testing`;
- revisar permissao e escopos do Gmail configurados no consent screen.
