---
title: Documentação do Zenit
slug: /docs
type: overview
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-10-02
summary: Índice técnico, responsabilidades e regras de publicação da documentação.
---

# Documentação do Zenit

## Guias e fontes

Para usar os aplicativos, comece pelos [guias públicos](help/zenit-documentation-overview-overview.md). Para desenvolver e operar, use os documentos abaixo.

| Assunto                             | Fonte de referência                                                                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Execução do monorepositório         | [README principal](https://github.com/danielchaves22/zenit#readme)                                                                                                                            |
| Cash e consultas financeiras        | [Gastos realizados](architecture/assistant/realized-expenses.md), [ponte Cash–Hub](architecture/assistant/zenit-hub-extraction.md), [áudio no Cash](architecture/assistant/whatsapp-audio.md) |
| Canal, conectores e entrega         | [Documentação do Hub](https://github.com/danielchaves22/zenit-hub/tree/master/docs)                                                                                                           |
| Assuntos, sincronização e lembretes | [Documentação do Day](https://github.com/danielchaves22/zenit-day/tree/master/docs)                                                                                                           |
| Site e portal de documentação       | [Publicação](operations/site/zenitapp-public-site-setup-guide.md)                                                                                                                             |
| Estilo e metadados                  | [Estilo](internal/decisions/docs-style-guide.md), [schema](internal/decisions/docs-frontmatter-schema.md)                                                                                     |

O domínio financeiro pertence ao Cash; assuntos e regras de lembretes pertencem ao Day; eventos pertencem ao Calendar; o Hub mantém conexões, consentimentos de envio e estado de entrega. Não copie contratos completos entre repositórios: faça referência à fonte responsável.

## Organização

- help/: instruções para usuários, por aplicativo.
- products/: comportamento e especificações funcionais, incluindo versões históricas.
- architecture/: decisões técnicas e contratos entre componentes.
- operations/: configuração, publicação, testes e diagnóstico.
- integrations/: provedores externos.
- internal/: normas editoriais, RFCs e decisões.
- legacy/: referências históricas ainda necessárias.

READMEs locais apresentam contexto e execução. docs/ guarda material durável. Notas de conversa, tarefas de sprint, credenciais e planos sem responsável ficam fora do portal.

## Publicação e manutenção

Todo Markdown em docs/ precisa de frontmatter válido. Slugs existentes são URLs estáveis: mudar um título não exige mudar o slug. Nomes de arquivo e slugs usam inglês/ASCII; o conteúdo voltado a este público pode ser escrito em português.

visibility controla a seleção: public é publicado no site público; internal e restricted entram apenas no build interno. O build interno contém material restrito e exige controle de acesso na hospedagem; noindex não é autenticação. status informa se o texto está ativo, em rascunho, depreciado ou arquivado; não substitui visibility.

Atualize last_reviewed somente quando o conteúdo daquele documento tiver sido conferido. Relatórios de validação e notas de versão preservam datas e limites originais. Um procedimento revisado hoje não significa que suas etapas foram repetidas no ambiente real.

Links Markdown para outro documento devem apontar ao arquivo relativo ou ao slug publicado. O gerador converte esses links, valida âncoras e recusa referência direta de uma página pública para conteúdo interno. Links relacionados aparecem somente quando o destino integra o mesmo build. Imagens públicas devem ficar em assets/ junto a um documento público; apenas arquivos referenciados são copiados.

```powershell
npm run test:docs
npm run build:docs:public
npm run build:docs:internal
```

Consulte o [guia de publicação](operations/site/zenitapp-public-site-setup-guide.md) antes de alterar a seleção, o layout ou a hospedagem. Para normas completas: [governança](internal/decisions/docs-governance-overview.md), [arquitetura da informação](internal/decisions/docs-information-architecture.md) e [modelos de documento](internal/decisions/docs-templates-guide.md).
