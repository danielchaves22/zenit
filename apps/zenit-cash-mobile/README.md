# Zenit Cash Mobile

App mobile novo do ecossistema Zenit para `insight + acao`, implementado em `Expo + React Native + TypeScript`.

Esta V1 entrega apenas a vertical slice do `Operador`:

- autenticacao real;
- reaproveitamento da ultima empresa valida;
- seletor de empresa quando necessario;
- home minima;
- chat por texto com streaming `SSE`;
- criacao de rascunho de lancamento por IA;
- confirmacao e cancelamento de `pending actions`.

O `Especialista` continua previsto na arquitetura, mas ainda nao foi implementado funcionalmente nesta entrega.

## Diretorio

```text
zenit/apps/zenit-cash-mobile
```

## Stack

- `Expo SDK 56`
- `React Native 0.85`
- `Expo Router`
- `TypeScript`
- `TanStack Query`
- `Zustand`
- `expo-secure-store`
- `expo-sqlite`
- `React Hook Form + Zod`

## O que o app usa do backend

### Autenticacao e bootstrap

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

### Assistente

- `POST /api/assistant/sessions`
- `GET /api/assistant/sessions/:sessionId/history`
- `POST /api/assistant/sessions/:sessionId/messages/stream`
- `POST /api/assistant/pending-actions/:pendingActionId/confirm`
- `POST /api/assistant/pending-actions/:pendingActionId/cancel`

### Requisitos funcionais do backend para esta V1

- usuario autenticado;
- cabecalho `X-App-Key: zenit-cash`;
- empresa ativa em `X-Company-Id`;
- grant efetivo do usuario para `ZENIT_CASH`;
- credencial OpenAI ativa na empresa;
- ao menos uma conta financeira acessivel;
- ao menos uma categoria do tipo adequado para o lancamento.

## Pre-requisitos

### Gerais

- Node.js `20+`
- npm `10+`
- monorepo instalado com `npm install` na raiz

### Para rodar o backend

- PostgreSQL disponivel
- arquivo `backend/.env` configurado
- migrations aplicadas

### Para rodar o app mobile

- Expo CLI via `npx expo`
- Android Studio e emulador Android, ou
- iOS Simulator em macOS, ou
- aparelho fisico com Expo Go na mesma rede local

## Configuracao de ambiente do app

Crie `apps/zenit-cash-mobile/.env` a partir de `.env.example`.

Arquivo de exemplo:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api
```

### Valor de `EXPO_PUBLIC_API_URL`

Use conforme o ambiente onde o app vai rodar:

- `http://localhost:3000/api`
  para iOS Simulator ou web local equivalente
- `http://10.0.2.2:3000/api`
  para Android Emulator
- `http://SEU_IP_NA_REDE:3000/api`
  para aparelho fisico na mesma rede do backend

Exemplo:

```env
EXPO_PUBLIC_API_URL=http://192.168.0.25:3000/api
```

## Configuracao minima do backend para testar o app

No `backend/.env`, garanta pelo menos:

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/zenit?schema=public"
PORT=3000
JWT_SECRET="dev-secret-change-in-production-minimum-32-chars"
NODE_ENV=development
REDIS_ENABLED=false
FRONTEND_URL="http://localhost:3001"
ALLOWED_ORIGINS="http://localhost:3001,http://localhost:3000"
INTEGRATION_SECRETS_MASTER_KEY="defina-uma-chave-forte"
```

Observacoes:

- `REDIS_ENABLED=false` funciona para desenvolvimento local;
- o app mobile nao fala direto com OpenAI;
- a credencial OpenAI precisa existir no banco para a empresa usada no app.

## Como preparar o backend

Na raiz do monorepo:

```bash
npm install
```

No backend:

```bash
cd backend
npm run prisma:generate
npm run prisma:deploy
npm run dev
```

Se estiver com banco vazio, voce tambem precisa:

1. ter um usuario;
2. ter uma empresa associada a esse usuario;
3. ter entitlement e grant para `ZENIT_CASH`;
4. ter conta(s) financeira(s) e categoria(s);
5. ter credencial OpenAI ativa para a empresa.

## Como preparar dados para uso real do app

Voce pode preparar isso de duas formas:

### Opcao 1. Usar dados ja existentes

Use um usuario/empresa ja configurados no ambiente local.

### Opcao 2. Criar via backend/admin

Garanta:

1. usuario com senha valida;
2. vinculo do usuario com a empresa em `UserCompany`;
3. app entitlement `ZENIT_CASH` habilitado na empresa;
4. user grant `ZENIT_CASH` habilitado para o usuario;
5. pelo menos uma conta financeira ativa;
6. pelo menos uma categoria de `EXPENSE` e uma de `INCOME`;
7. credencial OpenAI ativa em `CompanyAiCredential`.

Sem isso, o login pode funcionar, mas o fluxo do assistente nao fecha o rascunho corretamente.

## Como rodar o app

Na raiz do monorepo:

```bash
npm --workspace apps/zenit-cash-mobile run start
```

Ou, de dentro do app:

```bash
cd apps/zenit-cash-mobile
npx expo start --clear
```

Atalhos comuns:

```bash
npm --workspace apps/zenit-cash-mobile run android
npm --workspace apps/zenit-cash-mobile run ios
```

## Como validar cada funcionalidade da V1

### 1. Login

1. Abra o app.
2. Entre com email e senha validos.
3. O app deve salvar token, refresh token e ultima empresa valida em `SecureStore`.

Resultado esperado:

- se houver uma unica empresa acessivel, o app entra direto;
- se houver multiplas empresas sem ultima valida reaproveitavel, o app abre o seletor.

### 2. Bootstrap com ultima empresa valida

1. Entre no app.
2. Troque para uma empresa acessivel.
3. Feche e abra novamente.

Resultado esperado:

- o app reaproveita a ultima empresa valida;
- nao volta para o seletor sem necessidade.

### 3. Seletor de empresa

1. Entre com usuario que tenha mais de uma empresa com acesso ao `ZENIT_CASH`.
2. Abra `Trocar empresa` na home.

Resultado esperado:

- a lista mostra apenas empresas com acesso efetivo ao app;
- ao selecionar uma empresa, o app grava o novo `companyId` e volta para a home.

### 4. Criar sessao do assistente

1. Abra `Novo lancamento`.

Resultado esperado:

- o app cria ou reaproveita uma `assistant session`;
- o historico da sessao e carregado do backend;
- a sessao remota fica cacheada localmente por empresa em SQLite.

### 5. Streaming SSE do operador

1. No chat, envie algo como:

```text
gastei 42 no Uber hoje no Nubank
```

Resultado esperado:

- a mensagem do usuario entra imediatamente na UI;
- a resposta do assistente aparece em streaming;
- ao final do turno, o app recebe a resposta estruturada completa.

### 6. Criacao de rascunho

1. Envie uma mensagem de despesa, receita ou transferencia simples.

Exemplos:

```text
gastei 120,50 no posto shell hoje no nubank
recebi 3500 de salario hoje
```

Resultado esperado:

- o backend cria `AssistantTurn`, `AssistantMessage`, `AssistantPendingAction` e `AssistantToolTrace`;
- a resposta final mostra o card do rascunho;
- a transacao ainda nao existe em `FinancialTransaction`.

### 7. Confirmacao do rascunho

1. Toque em `Confirmar` no card do rascunho.

Resultado esperado:

- o backend cria a `FinancialTransaction`;
- a `pending action` muda para `CONFIRMED`;
- a UI reflete que o lancamento foi confirmado.

### 8. Cancelamento do rascunho

1. Gere um rascunho.
2. Toque em `Cancelar`.

Resultado esperado:

- a `pending action` muda para `CANCELED`;
- nenhuma transacao financeira e criada;
- a sessao e o historico continuam existindo.

### 9. Recuperacao de historico

1. Gere um ou mais turnos.
2. Saia da tela do assistente.
3. Volte para o assistente.

Resultado esperado:

- o historico volta pela API;
- o cache local em SQLite e atualizado;
- pending actions continuam visiveis no historico quando existirem.

## Como testar falhas relevantes

### Falha de autenticacao

- remova token/refresh token do dispositivo;
- ou invalide o token no backend.

Resultado esperado:

- o app volta para `login`;
- se o refresh ainda funcionar, ele renova o access token automaticamente.

### Falha de IA

- desative a credencial OpenAI da empresa;
- ou aponte uma chave invalida.

Resultado esperado:

- o streaming fecha com evento `turn.error`;
- a sessao continua preservada;
- o historico anterior nao e perdido.

### Falha de rede no aparelho fisico

- use `localhost` no `.env` com aparelho fisico fora do simulador.

Resultado esperado:

- o app nao consegue conectar;
- ajuste `EXPO_PUBLIC_API_URL` para o IP real da maquina.

## Testes automatizados disponiveis hoje

### Mobile

Hoje o app tem validacao por TypeScript:

```bash
npm --workspace apps/zenit-cash-mobile run typecheck
```

Ainda nao existe suite automatizada especifica de UI/E2E para o mobile nesta entrega.

### Backend do assistente

Teste de integracao focado no fluxo novo:

```bash
cd backend
node .\scripts\run-jest.js integration --runInBand __tests__/integration/assistant-runtime.test.ts
```

Esse teste cobre:

- bloqueio sem auth e sem `X-App-Key`;
- criacao de sessao;
- streaming SSE;
- criacao de draft;
- persistencia de `pending action`;
- persistencia de `tool trace`;
- confirmacao do lancamento;
- cancelamento;
- preservacao da sessao em falha da IA.

## Estrutura principal do app

```text
src/
  app/
    _layout.tsx
    index.tsx
    login.tsx
    company-select.tsx
    assistant.tsx
  components/
    assistant/
    auth/
    company/
    home/
  constants/
  lib/
  providers/
  store/
```

## Limitacoes atuais da V1

- sem voz;
- sem push proativo;
- sem `Especialista` funcional;
- sem consultas analiticas abertas;
- sem suite mobile automatizada;
- sem fallback manual completo de formulario detalhado;
- build do backend pode esbarrar em lock do `query_engine-windows.dll.node` se `prisma generate` for chamado repetidamente em paralelo no Windows.

## Troubleshooting

### O login funciona no backend, mas o app nao entra

Verifique:

- `EXPO_PUBLIC_API_URL`;
- `X-App-Key` esperado: `zenit-cash`;
- grant do usuario para a empresa;
- existencia de empresa acessivel ao app.

### O chat responde erro ao tentar lancar

Verifique:

- credencial OpenAI ativa em `CompanyAiCredential`;
- `INTEGRATION_SECRETS_MASTER_KEY` configurada no backend;
- existencia de conta acessivel para o usuario;
- existencia de categoria compativel com o tipo da transacao.

### O aparelho fisico nao conecta no backend local

Nao use `localhost`.

Use:

```env
EXPO_PUBLIC_API_URL=http://SEU_IP_LOCAL:3000/api
```

### O build/backend falha no Windows com `EPERM` no Prisma

Isso normalmente indica lock do binario `query_engine-windows.dll.node`.

Tente:

1. parar processos Node/Jest/dev server que estejam usando Prisma;
2. rodar novamente o comando;
3. se necessario, validar o backend com:

```bash
npx tsc --project backend/tsconfig.build.json
```

## Scripts uteis

Na raiz:

```bash
npm --workspace apps/zenit-cash-mobile run start
npm --workspace apps/zenit-cash-mobile run android
npm --workspace apps/zenit-cash-mobile run ios
npm --workspace apps/zenit-cash-mobile run typecheck
npm --workspace backend run prisma:generate
npm --workspace backend run prisma:deploy
npm --workspace backend run dev
```
