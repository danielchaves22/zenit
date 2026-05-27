# Testes do Frontend Cash

O app `zenit-cash` usa `Vitest` com `jsdom` para testes unitarios e de componente.

## Scripts

No diretorio `apps/zenit-cash`:

```bash
npm install
npm run test
npm run test:watch
npm run test:coverage
npm run typecheck
```

## Escopo inicial

Os primeiros testes cobrem:

- helpers de sessao e cabecalhos da API;
- helpers de permissao de rota;
- fluxo da pagina de login.

## Diretrizes

- prefira testar helpers puros antes de mexer em paginas grandes;
- quando um componente depender de `next/router` ou contexto, use mocks pequenos no proprio teste;
- mantenha refactors limitados as areas que receberam cobertura;
- para novas integracoes de rede, prefira extrair a logica para helpers testaveis antes de ampliar o componente.
