# ZenitCalc (frontend)

## Documentacao canonica

- visao geral: [`docs/products/zenit-calc/zenit-calc-frontend-overview.md`](../../docs/products/zenit-calc/zenit-calc-frontend-overview.md)
- calculo inicial: [`docs/products/zenit-calc/initial-calculation-functional-spec.md`](../../docs/products/zenit-calc/initial-calculation-functional-spec.md)

Estrutura reservada para o novo frontend ZenitCalc, com login e navegação próprios, consumindo a mesma API multi-tenant do Zenit.

- **Objetivo**: atender clientes que exigem UX/branding dedicado sem duplicar backend/banco.
- **Próximos passos**: inicializar o app Next.js aqui, configurando variáveis (`NEXT_PUBLIC_API_URL`) e dependências isoladas; implementar fluxo de autenticação que valide habilitação do usuário/empresa para o produto antes de liberar as rotas.
- **Contratos compartilhados**: componentes e tipos comuns deverão ser extraídos futuramente para `packages/` (por exemplo, `packages/ui` e `packages/api`).
