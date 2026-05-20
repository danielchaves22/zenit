# Zenit Docs

Esta pasta guarda documentacao de referencia do monorepo.

Regra pratica:

- `docs/` nao deve virar deposito de notas soltas;
- a raiz deve ter apenas este indice e subpastas por dominio;
- especificacoes funcionais, guias operacionais e decisoes tecnicas duraveis ficam aqui;
- planos taticos de sprint, cards de implementacao e material ja vencido nao devem permanecer como base de conhecimento.

## Estrutura Atual

### Cash

- [Mobile / Budget Reactivation MVP](cash/mobile/budget-reactivation-mvp.md)
  Especificacao tecnica da reativacao do app mobile de orcamento, com offline-first, sync Zenit e integracao controlada com o core financeiro.

- [Fixed Transactions / Functional Spec](cash/fixed-transactions/functional-spec.md)
  Referencia funcional das transacoes fixas mensais, incluindo materializacao e comportamento em relatorios.

- [UI / Add Theme Colors](cash/ui/add-theme-colors.md)
  Guia de manutencao do catalogo de temas do `apps/zenit-cash`.

### Calc

- [Initial Calculation / Functional Spec](calc/initial-calculation/functional-spec.md)
  Especificacao funcional e tecnica do calculo inicial do Zenit Calc.

### Integrations

- [Gmail / OAuth Setup](integrations/gmail/oauth-setup.md)
  Passo a passo operacional para configurar OAuth Gmail no ecossistema Zenit.

## Decisoes de Saneamento

- `despesas-fixas-cards.md` foi removido.
  O arquivo era um plano de execucao por cards para uma implementacao que ja foi absorvida pelo codigo, testes e rotas atuais. Mantinha baixo valor como referencia futura e aumentava ruido na pasta.

## Convencoes Recomendadas

- nomear docs por dominio e assunto, nao por momento da conversa;
- preferir `functional-spec`, `technical-spec`, `setup-guide` e nomes equivalentes;
- quando um doc deixar de ser referencia e virar apenas historico, remover ou mover para um arquivo de decisao ou registro mais apropriado.
