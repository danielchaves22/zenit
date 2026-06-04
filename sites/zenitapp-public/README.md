# zenitapp.net (site publico estatico)

Conteudo institucional, paginas de aplicacoes e materiais de compliance para o dominio `zenitapp.net`.

## Rotas

- `/` home institucional da Zenit App e apresentacao do ecossistema
- `/docs` portal de documentacao gerado a partir dos Markdown do monorepo
- `/zenitcalc` pagina dedicada ao ZenitCalc
- `/cash` pagina dedicada ao Cash
- `/orcamento-mobile` pagina dedicada ao Orcamento Mobile
- `/privacy` politica de privacidade
- `/terms` termos de servico
- `/login` redireciona para `https://calc.zenitapp.net/login`

## Estrutura

- `index.html`: landing institucional da marca e links para as aplicacoes
- `docs/`: saida gerada do portal de documentacao publica
- `zenitcalc/index.html`: pagina publica do ZenitCalc
- `cash/index.html`: pagina publica do Cash
- `orcamento-mobile/index.html`: pagina publica do Orcamento Mobile
- `styles.css`: estilos compartilhados por toda a experiencia publica

## Deploy no Render (Static Site)

- Criar um novo Static Site no Render apontando para este repositorio.
- Definir `Publish Directory` como `sites/zenitapp-public`.
- Definir `Build Command` como `npm run build:docs:public`.
- Configurar dominio custom `zenitapp.net` (e opcionalmente `www.zenitapp.net`).

## Observacao

O app autenticado do ZenitCalc continua em `calc.zenitapp.net` (servico Next.js separado).
O portal `/docs` e gerado a partir do acervo em `docs/`, que continua sendo a fonte de verdade.
