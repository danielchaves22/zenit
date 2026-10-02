# Zenit Cash

Aplicação de finanças pessoais do ecossistema Zenit. Este diretório contém o frontend Next.js com Pages Router; a API, a autorização e as regras financeiras ficam no backend do monorepositório.

## Uso e documentação

- [Guia do Cash](../../docs/help/zenit-cash/zenit-cash-help-overview.md)
- [Configuração do monorepositório](../../README.md)
- [Documentação técnica](../../docs/README.md)
- [Gastos realizados](../../docs/architecture/assistant/realized-expenses.md)
- [Integração com o Hub](../../docs/architecture/assistant/zenit-hub-extraction.md)

## Execução

Instale dependências na raiz com npm ci e configure o backend primeiro. Copie .env.local.example para .env.local. NEXT_PUBLIC_API_URL aponta para a API (o exemplo usa http://localhost:3000/api); NEXT_PUBLIC_APP_KEY identifica zenit-cash. Esses valores são públicos. Nunca inclua segredos de provedores no frontend.

Na raiz do monorepositório:

```powershell
npm --workspace apps/zenit-cash run dev
npm --workspace apps/zenit-cash run typecheck
npm --workspace apps/zenit-cash test
npm --workspace apps/zenit-cash run build
```

O modo de desenvolvimento usa http://localhost:3001. Confira os fluxos alterados também na interface e nos tamanhos de tela atendidos; typecheck e testes unitários não substituem essa verificação.

## Limites de responsabilidade

A interface apresenta prévias, formulários e resultados. Identidade, acesso ao workspace, permissões por conta financeira e persistência são verificados novamente pelo backend. Totais de gastos realizados incluem compras no cartão pela data da compra/competência e excluem o pagamento da fatura para evitar duplicidade; fluxo de caixa é uma consulta diferente.
