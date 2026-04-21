# Configuracao Google OAuth + Gmail para Zenit

Este documento registra o passo a passo para configurar a integracao Gmail no Zenit com a conta Google correta.

## 1) Usar a conta Google correta

- Entrar com a conta que sera dona do projeto GCP.
- Garantir permissoes de Owner/Editor no projeto e acesso ao dominio no Search Console.

## 2) Criar ou selecionar projeto no Google Cloud

- Acessar [Google Cloud Console](https://console.cloud.google.com).
- Criar um projeto dedicado (recomendado para producao).

## 3) Verificar dominio no Search Console

- Verificar `zenitapp.net` na conta correta.
- Search Console: [https://search.google.com/search-console](https://search.google.com/search-console)

## 4) Configurar OAuth Consent Screen (Google Auth Platform)

No Google Cloud, abrir Google Auth Platform e configurar:

- Branding:
  - App name: `Zenit`
  - Homepage: `https://zenitapp.net/`
  - Privacy: `https://zenitapp.net/privacy`
  - Terms: `https://zenitapp.net/terms`
  - Authorized domain: `zenitapp.net`
- Audience:
  - `External`
  - Se estiver em Testing, adicionar usuarios em Test users.
- Data Access (escopos):
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/gmail.modify`

## 5) Ativar Gmail API

- Em APIs & Services -> Library, habilitar Gmail API.

## 6) Criar OAuth Client ID (Web Application)

- Em Credentials -> Create Credentials -> OAuth Client ID -> Web application.
- Configurar redirect URI autorizado (exato):
  - `https://SEU_BACKEND/api/integrations/gmail/oauth/callback`

Recomendacao: usar backend em dominio proprio (ex.: `https://api.zenitapp.net`) para reduzir friccao de verificacao de dominio.

## 7) Variaveis de ambiente no backend (Render)

Configurar no servico backend:

- `GMAIL_OAUTH_CLIENT_ID`
- `GMAIL_OAUTH_CLIENT_SECRET`
- `GMAIL_OAUTH_REDIRECT_URI` = `https://SEU_BACKEND/api/integrations/gmail/oauth/callback`
- `FRONTEND_URL` = `https://calc.zenitapp.net`
- `ALLOWED_ORIGINS` = `https://calc.zenitapp.net`
- `INTEGRATION_SECRETS_MASTER_KEY` (obrigatoria e forte)

Opcional (pode ficar vazio nesta fase):

- `GMAIL_PUBSUB_TOPIC`
- `GMAIL_WEBHOOK_SECRET`
- `WEBHOOK_BASE_URL`

## 8) Variavel no frontend zenit-calc

- `NEXT_PUBLIC_API_URL` = `https://SEU_BACKEND/api`

## 9) Teste funcional da conexao

1. Fazer deploy de backend e frontend.
2. Entrar no `calc.zenitapp.net` com usuario `SUPERUSER`.
3. Abrir Configuracoes -> Empresa -> Gmail.
4. Clicar em conectar (OAuth).
5. No retorno, confirmar query `settings?tab=company&gmail=connected`.
6. Executar "Sincronizar agora".

## 10) Observacao para producao

Como os escopos utilizados incluem `gmail.modify`, o app usa escopos restritos. Para uso amplo em producao, pode ser exigida verificacao adicional do Google.

## Referencias oficiais

- OAuth consent e configuracao: [https://developers.google.com/workspace/guides/configure-oauth-consent](https://developers.google.com/workspace/guides/configure-oauth-consent)
- Brand/domain verification: [https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
- Gmail scopes: [https://developers.google.com/workspace/gmail/api/auth/scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- OAuth policy compliance: [https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)
