# Instruções para trabalhar no Zenit

Estas orientações se aplicam a todo o monorepo. Arquivos `AGENTS.md` em subdiretórios podem complementar ou especializar as regras para uma aplicação.

## Organização e escopo

- O projeto usa npm workspaces. Execute os comandos abaixo a partir da raiz, com Node.js 22 e npm 10 ou superior.
- As aplicações ficam em `apps/`; a API compartilhada, em `backend/`; contratos e bibliotecas comuns, em `packages/`.
- Antes de alterar código, confira o estado do Git e identifique as aplicações afetadas. Preserve alterações locais que não pertençam à tarefa.
- Mudanças no backend ou em pacotes compartilhados precisam considerar seus consumidores. Preserve o isolamento por empresa e as permissões específicas de cada aplicação.
- Use o [README](README.md) como ponto de entrada e o [índice técnico](docs/README.md) para contratos e procedimentos. Não trate planos documentados como funcionalidades já implementadas.

## Commits

- Escreva as mensagens em português e identifique a aplicação com um prefixo entre colchetes.
- Use o formato `[APP] tipo(escopo): descrição`, por exemplo: `[BIZZ] feat(login): melhorar a legibilidade da tela de acesso`.
- Use `[BIZZ]`, `[CASH]`, `[CALC]` ou `[ADMIN]` conforme a aplicação. Para alterações gerais do monorepo, use `[ZENIT]`.
- Se uma alteração atender a várias aplicações, deixe isso explícito na descrição. Separe mudanças independentes em commits próprios.
- Confira o diff preparado para o commit e inclua somente os arquivos pertencentes à tarefa.

## Validação

Escolha as verificações conforme o que mudou. Os scripts definidos nos `package.json` são a referência para os comandos disponíveis.

| Área alterada | Comandos disponíveis na raiz |
| --- | --- |
| Bizz | `npm run test:zenit-bizz`; `npm run build:zenit-bizz` |
| Cash | `npm run test:zenit-cash`; `npm run build:zenit-cash` |
| Admin | `npm run build:zenit-admin` |
| Calc | `npm run build:zenit-calc` |
| Backend | `npm run lint:backend`; `npm run build:backend`; `npm run test:backend` |
| Gerador e publicação da documentação | `npm run test:docs`; `npm run build:docs` |

- Em mudanças visuais, confira computador e celular, incluindo telas estreitas. Revise legibilidade, quebras de texto, foco pelo teclado e ações afetadas.
- Faça novas rodadas de ajuste quando a revisão revelar problemas concretos. Revalide a parte alterada até resolver esses problemas.
- Testes de integração exigem uma base própria, conforme o [guia de testes do backend](docs/operations/testing/backend-local-integration-testing-guide.md). Não use a base de produção em testes ou migrações de desenvolvimento.
- Para mudanças somente em instruções ou documentação textual, confira o diff, os links e os comandos citados; não execute toda a suíte da aplicação sem necessidade.
- Informe quais verificações passaram e quais limites permanecem. Build, typecheck e testes locais não comprovam, sozinhos, o funcionamento de serviços externos ou da versão publicada.
- Não inclua segredos em código, documentação, logs ou commits. Variáveis `NEXT_PUBLIC_*` são públicas no navegador.

## Publicação

- Quando o usuário solicitar publicação, respeite o destino informado. No fluxo padrão deste monorepo, sincronize `develop` e `master` nos remotos `origin` (GitHub) e `bitbucket`.
- Antes de publicar, atualize as referências remotas e confira divergências. Prefira avanço direto (`fast-forward`), sem sobrescrever commits remotos nem descartar trabalho local.
- Publicar no Git e concluir o deploy são etapas diferentes. Quando houver deploy envolvido, confira a versão servida ou o estado do serviço antes de afirmar que está disponível.
- Ao concluir, informe o commit, os destinos atualizados e o resultado da validação da publicação.

## Manutenção destas instruções

- Mantenha este arquivo curto e voltado às convenções compartilhadas. Detalhes de uma aplicação devem ficar no `AGENTS.md` da pasta correspondente; procedimentos extensos, em `docs/`.
- Atualize instruções que deixarem de corresponder aos scripts ou à estrutura real do repositório.
