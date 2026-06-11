# Zenit Cash Redesign Blueprint

## Objetivo

Este documento traduz a proposta de reformulacao do Zenit Cash em um plano implementavel, alinhado ao estado atual do projeto:

- `Next.js 15` com `Pages Router`
- `AuthProvider`, `ThemeProvider` e `ToastProvider` em [pages/_app.tsx](/C:/dev/equinox/zenit/apps/zenit-cash/pages/_app.tsx)
- controle de permissoes por `role` e por grants financeiros em [contexts/AuthContext.tsx](/C:/dev/equinox/zenit/apps/zenit-cash/contexts/AuthContext.tsx), [hooks/usePermissions.ts](/C:/dev/equinox/zenit/apps/zenit-cash/hooks/usePermissions.ts) e [lib/routeProtection.ts](/C:/dev/equinox/zenit/apps/zenit-cash/lib/routeProtection.ts)
- `dashboard shell` atual baseado em [components/layout/DashboardLayout.tsx](/C:/dev/equinox/zenit/apps/zenit-cash/components/layout/DashboardLayout.tsx) e [components/layout/Sidebar.tsx](/C:/dev/equinox/zenit/apps/zenit-cash/components/layout/Sidebar.tsx)

O foco nao e refazer tudo de uma vez. O foco e migrar a experiencia para um `app shell` mais moderno sem quebrar as rotas atuais.

## Principios

1. A navegacao principal deve refletir modulos e fluxos, nao apenas rotas.
2. Acoes globais devem sair da sidebar e virar `Novo`.
3. A shell do produto deve ser consistente entre home, listas, formularios e relatorios.
4. Permissoes devem ser declaradas no mesmo lugar da navegacao e das superficies de rota.
5. A migracao deve preservar `hrefs`, SSR e compatibilidade com o `Pages Router`.

## Nova Arquitetura de Informacao

### Navegacao primaria

Destinos primarios:

1. `Inicio`
2. `Movimentacao`
3. `Contas`
4. `Planejamento`
5. `Analises`
6. `Cadastros`
7. `Administracao`

Regras:

- `Desktop`: sidebar fixa, recolhivel, com um nivel de expansao por clique.
- `Tablet`: navigation rail + painel de contexto.
- `Mobile`: bottom navigation com `Inicio`, `Movimentacao`, `Contas`, `Mais` e `Novo`.
- `Top bar`: marca contextual, empresa atual, busca global, notificacoes, assistente, perfil.
- `CTA global`: `Novo` com criacao contextual.

### Acoes globais

O botao `Novo` deve reunir:

- `Nova despesa`
- `Nova receita`
- `Nova transferencia`
- `Nova compra no cartao`
- `Nova conta`
- `Novo cartao`
- `Nova categoria`

Isso substitui a mistura atual entre navegacao e acao operacional observada em [components/layout/Sidebar.tsx](/C:/dev/equinox/zenit/apps/zenit-cash/components/layout/Sidebar.tsx).

### Navegacao local

Padrao por superficie:

- `Overview`: cards, KPIs, pendencias, recentes, favoritos
- `Workspace`: tabs locais, filtros persistentes, tabela/lista, painel de detalhes
- `Formulario`: cabecalho contextual, secoes progressivas, acoes fixas
- `Relatorio`: filtros, presets, visualizacoes, exportacao
- `Configuracao`: categories list + detail editor

## Mapeamento das Rotas Atuais

### Inicio

- `/`

### Movimentacao

- `/financial/transactions`
- `/financial/transactions/new`
- `/financial/transactions/new-credit-card-purchase`
- `/financial/transactions/[id]`

### Contas

- `/financial/accounts`
- `/financial/accounts/new`
- `/financial/accounts/[id]`
- `/financial/credit-cards`
- `/financial/credit-cards/new`
- `/financial/credit-cards/purchases`
- `/financial/credit-cards/[accountId]`
- `/financial/credit-cards/[accountId]/invoices`
- `/financial/credit-cards/[accountId]/reconciliation`

### Planejamento

- `/financial/fixed-transactions`
- `/financial/fixed-transactions/new`
- `/financial/fixed-transactions/[id]`
- `/financial/budgets`
- `/financial/budgets/[budgetId]`

### Analises

- `/financial/dashboard`
- `/financial/reports`
- `/financial/reports/cashflow`
- `/financial/reports/dre`
- `/financial/reports/balance`
- `/financial/reports/financial-account-movement`

### Cadastros

- `/financial/categories`
- `/financial/categories/new`
- `/financial/categories/[id]`

### Administracao

- `/admin/users`
- `/admin/users/new`
- `/admin/users/[id]`
- `/admin/settings`
- `/admin/companies`

## Shell Alvo

### Estrutura

```text
AppShell
  TopBar
  Sidebar
  MainViewport
    PageHeader
    ContextTabs
    PageToolbar
    ContentArea
    OptionalDetailPanel
```

### Comportamento

- `Sidebar` e a navegacao primaria.
- `TopBar` nao replica navegacao.
- `Breadcrumb` vira opcional e secundario.
- `AssistantFloatingChat` sai da camada solta e vira entrada formal da top bar, com drawer lateral quando aberto.
- `CompanySwitcherModal` pode continuar existindo na fase inicial, mas a troca de empresa deve ganhar um trigger fixo no topo.

## Templates de Pagina

### 1. Home de modulo

Uso:

- `/`
- `/financial/dashboard`
- `/financial/reports`

Blocos:

- saudacao contextual
- cards de KPI
- pendencias
- atividade recente
- atalhos fixados
- relatorios favoritos

### 2. Workspace list-detail

Uso:

- `/financial/transactions`
- `/financial/credit-cards`
- `/financial/accounts`
- `/admin/users`

Blocos:

- titulo + tabs locais
- barra de filtros persistente
- contadores sinteticos
- tabela/lista principal
- painel lateral de detalhes
- acoes em massa e acoes contextuais

### 3. Formulario operacional

Uso:

- rotas `/new`
- telas `/[id]` editaveis

Blocos:

- header contextual
- secoes agrupadas por assunto
- sidebar opcional de resumo
- acoes fixas no rodape ou header sticky

### 4. Relatorios e analises

Uso:

- `cashflow`, `dre`, `balance`, `financial-account-movement`

Blocos:

- filtros e presets
- faixa de periodo
- area de leitura numerica
- visualizacoes
- exportacao

### 5. Configuracoes e cadastros

Uso:

- `categories`, `settings`, `companies`

Blocos:

- lista ou arvore
- editor lateral ou formulario
- estados vazios orientados por tarefa

## Design Tokens

O projeto atual usa variaveis CSS para tema em [styles/globals.css](/C:/dev/equinox/zenit/apps/zenit-cash/styles/globals.css). A recomendacao e evoluir isso para um sistema de tokens por papel, nao por cor isolada.

### Tokens base

```css
--color-bg-app
--color-bg-surface
--color-bg-elevated
--color-bg-contrast
--color-fg-default
--color-fg-muted
--color-fg-soft
--color-border-subtle
--color-border-strong
--color-accent
--color-accent-strong
--color-success
--color-warning
--color-danger
--shadow-sm
--shadow-md
--shadow-lg
--radius-sm
--radius-md
--radius-lg
--space-2
--space-3
--space-4
--space-6
--space-8
```

### Direcao visual

- base clara premium, nao branca pura
- sidebar escura como ancora de navegacao
- superficie principal quente e limpa
- verde para sucesso e confirmacao
- ambar para alerta e pendencia
- sem roxo
- tipografia com mais contraste de personalidade entre `display`, `body` e `numeric`

### Regras

- `accent` nao deve carregar a interface inteira
- indicadores numericos devem usar colunas e pesos mais consistentes
- cards devem variar por funcao, nao apenas por borda
- motion curta e util, sem animacao global em tudo

## Mapa de Componentes

### Novo pacote de shell

```text
components/
  shell/
    AppShell.tsx
    ShellSidebar.tsx
    ShellTopbar.tsx
    ShellHeader.tsx
    ShellContextTabs.tsx
    ShellCommandMenu.tsx
    ShellCreateMenu.tsx
    ShellDetailPanel.tsx
```

### Navegacao e metadata

```text
lib/
  navigation/
    app-shell.ts
    page-metadata.ts
```

### Primitivos que valem refactor

```text
components/ui/
  Button.tsx
  Card.tsx
  Input.tsx
  Select.tsx
  Modal.tsx
```

Evolucoes recomendadas:

- `Button`: tamanhos, estados, leading/trailing icon, loading
- `Card`: variantes `overview`, `metric`, `table`, `panel`
- `Input` e `Select`: densidade e estados mais consistentes
- `Modal`: drawer lateral e fullscreen mobile

## Estrategia Tecnica

### 1. Centralizar configuracao de navegacao

Toda informacao abaixo deve sair de um unico lugar:

- destinos primarios
- match de rotas
- permissoes
- acoes globais
- metadata da pagina

Isso reduz a duplicacao atual entre:

- [components/layout/Sidebar.tsx](/C:/dev/equinox/zenit/apps/zenit-cash/components/layout/Sidebar.tsx)
- [components/ui/SmartNavigation.tsx](/C:/dev/equinox/zenit/apps/zenit-cash/components/ui/SmartNavigation.tsx)
- [lib/routeProtection.ts](/C:/dev/equinox/zenit/apps/zenit-cash/lib/routeProtection.ts)

### 2. Introduzir metadata por pagina

Cada pagina deve declarar ou derivar:

- modulo
- template
- titulo
- tabs locais
- acoes de header
- largura do layout
- necessidade de painel de detalhe

### 3. Preservar Pages Router na fase 1

Nao ha motivo tecnico forte para migrar para `App Router` antes da nova shell estabilizar. A recomendacao e:

1. padronizar layout e metadata
2. centralizar navegacao
3. migrar templates
4. avaliar App Router apenas depois

## Plano de Migracao

### Fase 0. Fundacao

- criar `lib/navigation/app-shell.ts`
- criar `components/shell/*`
- introduzir tokens novos sem remover os antigos
- manter [components/layout/DashboardLayout.tsx](/C:/dev/equinox/zenit/apps/zenit-cash/components/layout/DashboardLayout.tsx) como adaptador temporario

Entrega:

- nenhum `href` muda
- nenhuma pagina quebra

### Fase 1. Shell nova com compatibilidade

- substituir a sidebar atual pela nova shell
- mover troca de empresa, busca e perfil para a top bar
- transformar `Novo` em menu global
- encaixar `AssistantFloatingChat` como entrada da shell

Entrega:

- todas as paginas privadas passam pelo mesmo `AppShell`

### Fase 2. Piloto em Movimentacao

Escopo:

- `/financial/transactions`
- `/financial/transactions/[id]`
- `/financial/transactions/new`

Entrega:

- tabs locais
- filtros persistentes
- tabela list-detail
- painel lateral de detalhe

Motivo:

- e a area com maior retorno visual e operacional

### Fase 3. Contas e Planejamento

- consolidar `accounts` e `credit-cards` em uma experiencia unificada
- aproximar `fixed-transactions` e `budgets` do modulo `Planejamento`

### Fase 4. Analises

- criar home de `Analises`
- padronizar filtros, cards numericos e exportacao

### Fase 5. Cadastros e Administracao

- padronizar UX de cadastro
- aplicar o mesmo template de list-detail e editor

## Primeira Vertical Recomendada

Se for para comecar por uma vertical so, eu faria:

1. `AppShell`
2. `navigation config`
3. `Movimentacao workspace`
4. `Create menu`
5. `command/search`

Isso ja muda radicalmente a percepcao do produto sem depender de refactor geral do dominio financeiro.

## Criterios de aceite

- a navegacao primaria tem no maximo sete destinos
- nenhuma acao operacional principal fica escondida em hover
- o usuario entende onde esta no produto sem depender de breadcrumb
- desktop e mobile compartilham a mesma IA
- permissoes de menu e de rota usam a mesma matriz
- novas telas podem ser registradas sem editar varios arquivos diferentes

## Proximos passos concretos

1. implementar `lib/navigation/app-shell.ts`
2. criar `components/shell/AppShell.tsx`
3. adaptar `DashboardLayout` para delegar a nova shell
4. migrar `Sidebar` e `SmartNavigation` para usar a configuracao central
5. escolher `Movimentacao` como piloto visual e estrutural
