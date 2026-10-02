---
title: Site institucional e portal de documentação
slug: /docs/operations/site/zenitapp-public-site-setup
type: setup-guide
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-10-02
summary: Estrutura, geração, validação e publicação do site institucional e dos guias públicos.
---

# Site institucional e portal de documentação

## Estrutura

O site público usa HTML, CSS e JavaScript estáticos em sites/zenitapp-public. A entrada apresenta duas áreas: /para-voce/ (Cash, Day, Clock e Hub) e /para-negocios/ (soluções e contato). As páginas /sobre/, /contato/, /privacy/ e /terms/ completam o conteúdo institucional. Rotas anteriores permanecem como páginas de compatibilidade.

O portal /docs/ é gerado a partir de docs/. Edite o Markdown de origem; não edite sites/zenitapp-public/docs. O gerador usa scripts/generate-docs-site.mjs, scripts/docs-site/docs.css e scripts/docs-site/docs.js. O conteúdo institucional fora de /docs/ não é removido pelo build.

## Gerar e validar

Na raiz, com Node.js 22 e dependências do lockfile:

```powershell
npm ci
npm run test:docs
npm run build:docs:public
npm run build:docs:internal
```

O build público seleciona visibility: public. O build interno inclui também internal e restricted e escreve em sites/zenitapp-internal; não publique esse diretório no site aberto. O status editorial aparece no documento e não funciona como regra de acesso. Não marque rascunhos confidenciais como públicos.

O gerador valida frontmatter, slugs únicos, links entre documentos, arquivos locais e âncoras antes de substituir a saída anterior. A publicação copia apenas assets referenciados. Symlinks e caminhos fora da fonte são recusados. HTML bruto é exibido como texto: use Markdown para links e imagens, sem contornar a seleção de visibilidade.

O sumário usa os mesmos IDs dos títulos. A pesquisa busca título, resumo e conteúdo em um índice local, gerado apenas com documentos do mesmo build. Ela não envia consultas a um serviço externo. Navegação e leitura continuam disponíveis sem JavaScript; pesquisa e menu compacto usam scripts/docs-site/docs.js.

## Hospedagem pública

O Static Site institucional no Render publica a branch master do repositório zenit. Configuração de referência:

| Campo                     | Valor                               |
| ------------------------- | ----------------------------------- |
| Build                     | npm ci && npm run build:docs:public |
| Diretório publicado       | sites/zenitapp-public               |
| Domínio público           | https://zenitapp.net                |
| Diretório de documentação | /docs/                              |

Confirme a branch e o commit no painel antes de publicar. Não exponha o build interno, .env, logs ou artefatos de análise. A geração é estática: não exige banco, token Google ou credencial WhatsApp.

## Conferência após a publicação

1. Confira home, áreas pessoal/negócios, páginas dos aplicativos, contato e documentos institucionais.
2. Abra /docs/ e um guia de cada aplicativo; confirme título, atualização, links e estilos.
3. Pesquise termos com e sem acentos e um termo sem resultado.
4. Teste links do sumário, navegação por teclado, menu compacto e leitura em 320 px.
5. Confirme que URLs antigas dos guias continuam funcionando e que o índice público não contém documentos internos.

Build e testes do gerador verificam publicação; não validam funcionalidades dos aplicativos, credenciais ou serviços conectados. Registre separadamente qualquer teste feito nesses ambientes.

## Diagnóstico

- Documento ausente: confira visibility e metadados, execute o build e confirme o commit publicado.
- Link ou âncora inválidos: use o arquivo/slug correto e um título que exista; evite URLs montadas a partir do nome físico do Markdown.
- Imagem ausente: mantenha o arquivo na pasta assets/ do documento e use caminho relativo; arquivos sem referência não são publicados.
- Falha na pesquisa: verifique /docs/assets/search-index.json e /docs/assets/docs.js; o menu continua disponível.
- Conteúdo antigo: compare o commit do deploy e o resultado local; arquivos gerados não devem ser corrigidos manualmente no servidor.
