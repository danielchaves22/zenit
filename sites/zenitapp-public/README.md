# zenitapp.net (site publico estatico)

Conteudo institucional e de compliance para o dominio `zenitapp.net`.

## Rotas

- `/` pagina institucional
- `/privacy` politica de privacidade
- `/terms` termos de servico
- `/login` redireciona para `https://calc.zenitapp.net/login`

## Deploy no Render (Static Site)

- Criar um novo Static Site no Render apontando para este repositorio.
- Definir `Publish Directory` como `sites/zenitapp-public`.
- Sem build command (ou comando vazio), pois o site e HTML/CSS estatico.
- Configurar dominio custom `zenitapp.net` (e opcionalmente `www.zenitapp.net`).

## Observacao

O app autenticado fica em `calc.zenitapp.net` (servico Next.js separado).
