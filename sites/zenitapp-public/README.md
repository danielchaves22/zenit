# zenitapp.net (site publico estatico)

Conteudo institucional, paginas de aplicacoes e materiais de compliance para o dominio `zenitapp.net`.

## Rotas

- `/` home institucional da Zenit App e apresentacao do ecossistema
- `/zenitcalc` pagina dedicada ao ZenitCalc
- `/cash` pagina dedicada ao Cash
- `/orcamento-mobile` pagina dedicada ao Orcamento Mobile
- `/privacy` politica de privacidade
- `/terms` termos de servico
- `/login` redireciona para `https://calc.zenitapp.net/login`

## Estrutura

- `index.html`: landing institucional da marca e links para as aplicacoes
- `zenitcalc/index.html`: pagina publica do ZenitCalc
- `cash/index.html`: pagina publica do Cash
- `orcamento-mobile/index.html`: pagina publica do Orcamento Mobile
- `styles.css`: estilos compartilhados por toda a experiencia publica

## Deploy no Render (Static Site)

- Criar um novo Static Site no Render apontando para este repositorio.
- Definir `Publish Directory` como `sites/zenitapp-public`.
- Sem build command (ou comando vazio), pois o site e HTML/CSS estatico.
- Configurar dominio custom `zenitapp.net` (e opcionalmente `www.zenitapp.net`).

## Observacao

O app autenticado do ZenitCalc continua em `calc.zenitapp.net` (servico Next.js separado).
