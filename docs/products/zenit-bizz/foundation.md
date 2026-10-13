---
title: Zenit Bizz — acesso e cadastros
slug: /docs/products/zenit-bizz/foundation
type: technical-spec
product: zenit-bizz
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-10-13
summary: Fundação do Bizz, acesso por usuário e empresa, cadastros e limites da primeira versão.
tags:
  - zenit-bizz
  - access
  - contacts
---

# Zenit Bizz — acesso e cadastros

O Bizz inicia no monorepo com a premissa de simplicidade na operação e consistência nos dados. O piloto é uma floricultura; a modelagem inicial é genérica para clientes e fornecedores de pequenos negócios.

## Acesso efetivo

O acesso exige autenticação, vínculo `UserCompany`, catálogo ativo, habilitação `CompanyAppEntitlement` e concessão `UserAppGrant` para o mesmo usuário, empresa e aplicativo. A chave é `zenit-bizz` / `ZENIT_BIZZ`. Nenhum papel ignora essas condições.

O backend revalida o acesso a cada requisição, inclusive após revogação. O frontend apresenta apenas empresas com acesso ao Bizz, restaura uma seleção ainda autorizada e seleciona automaticamente quando há somente uma opção.

As rotas `/api/bizz/*` exigem a chave do Bizz. Uma chamada identificada como Bizz só pode acessar essas rotas e a consulta de acesso efetivo. Acesso ao Bizz não libera rotas financeiras, usuários, empresas ou administração de permissões. Futuras integrações com Cash exigirão contratos explícitos; não devem remover essa restrição indiscriminadamente.

O endpoint compartilhado autenticado `PUT /api/auth/password` exige a senha atual, valida a nova senha e conclui o primeiro acesso. Os cadastros do Bizz recusam usuários com troca de senha pendente.

A revisão do fluxo de concessões também bloqueia alterações de `appGrants` por usuários comuns em seu próprio perfil, concessões fora da empresa por `SUPERUSER` e concessões para empresas sem vínculo com o usuário. Na criação, uma lista de concessões explicitamente vazia permanece vazia. Os padrões anteriores continuam para chamadas sem essa lista, exceto Bizz, cuja concessão é sempre explícita.

## Administração de aplicativos

O administrador da plataforma (`ADMIN`) seleciona os aplicativos em **Zenit Admin → Administração → Empresas → Criar/Editar → Aplicativos da empresa**. A edição usa o ID da empresa cadastrada, sem exigir vínculo ou troca da empresa ativa do administrador. A habilitação não concede acesso individual automaticamente.

`POST /api/companies` e `PUT /api/companies/:id` aceitam `appEntitlements`, uma lista de `{ appKey, enabled }`, e salvam os dados e as habilitações na mesma transação. Na criação, omitir a lista mantém os padrões legados; enviá-la explicitamente substitui esses padrões. Na edição, somente as entradas enviadas são alteradas. A rota legada `PUT /api/app-access/company/entitlements` também exige `ADMIN`.

Quem gerencia usuários (`ADMIN` ou `SUPERUSER`, conforme seu escopo) escolhe os acessos individuais no cadastro de usuários entre os aplicativos habilitados para cada empresa. Desabilitar um aplicativo bloqueia o acesso efetivo sem apagar os dados nem as concessões individuais; reabilitá-lo restaura o acesso dos usuários que mantiveram a concessão. O Cash apenas apresenta o estado da habilitação do WhatsApp; a alteração fica centralizada no Zenit Admin.

## Cadastro único

`BizzContact` pertence à empresa e reúne pessoas físicas e jurídicas na lista **Pessoas e empresas**. Cliente e fornecedor são relacionamentos opcionais e podem coexistir; um cadastro sem relacionamento também pode ser salvo. Nome é obrigatório. Documento, telefone, e-mail, endereço e observações são opcionais. Documentos informados são normalizados e únicos dentro da empresa; ausência de documento é permitida. Isso não representa validação cadastral perante órgãos oficiais.

O endereço é composto por CEP, logradouro, número, complemento, bairro, cidade, estado/região e país. Não há consulta externa de CEP. Campos de endereço omitidos na edição preservam seus valores; texto vazio ou `null` os limpa. Os identificadores e relacionamentos dos registros existentes permanecem os mesmos. Não há catálogo de produtos/serviços ou papéis personalizados nesta etapa.

O identificador permanece estável após edição/inativação e poderá ser referenciado nas compras e vendas futuras. Não há relacionamento financeiro implementado nesta versão.

Telefones e e-mails são listas ordenadas (`phones` e `emails`), com até 20 valores de cada tipo. Linhas vazias do formulário não são enviadas. O servidor valida cada valor e rejeita repetições no mesmo cadastro (e-mail sem distinção de maiúsculas; telefone ignorando a pontuação). A busca considera também os valores adicionais.

`BizzContactMethod` armazena os valores vinculados ao cadastro; a empresa é resolvida pelo cadastro pai. A gravação das listas e da versão ocorre na mesma transação. Os campos legados `phone` e `email` continuam refletindo o primeiro valor. Listas explícitas substituem os respectivos valores; listas vazias os removem. Uma edição legada que envie apenas o campo singular substitui ou remove o primeiro valor, preservando os adicionais. Omissão de ambos os formatos preserva os valores na edição. Se os dois formatos forem enviados, prevalece a lista.

- `GET /api/bizz/contacts`: busca por `q`, relacionamento `customer|supplier|both|none|all`, tipo `personType=PERSON|BUSINESS|all`, situação `active|inactive|all` e página; 20 registros por página. Os filtros de cliente e fornecedor incluem quem tem ambos os relacionamentos.
- `GET /api/bizz/contacts/:id`: consulta individual para edição por URL; retorna 404 se o cadastro não pertencer à empresa ativa.
- `POST /api/bizz/contacts`: criação com `requestKey` UUID. Repetição da mesma tentativa retorna o registro existente; reuso da chave com dados diferentes retorna 409.
- `PUT /api/bizz/contacts/:id`: edição com a versão lida; alterações concorrentes retornam 409. Inclui inativação e reativação.
- `GET /api/bizz/session`: contexto da empresa validado pelo backend.

O servidor determina usuário/empresa e não aceita atribuição desses campos pelo formulário. Todas as consultas e atualizações são limitadas à empresa ativa. São preservados autor da criação, autor da última alteração, datas e versão; isso não é um histórico completo de revisões.

## Interface

Tema claro, marca laranja `#F97316`, navegação retrátil, adaptação a telas pequenas e formulários com informações complementares recolhíveis. Botões preenchidos usam um tom mais escuro de laranja para legibilidade do texto. Estados vazios correspondem a dados reais; não há indicadores de vendas ou compras ainda não implementados.

Formulários preservam os dados após falha de gravação, confirmam descarte de alterações e impedem submissões simultâneas. A integração financeira será validada numa próxima entrega com compra, compromisso pendente no Cash e retorno da situação ao Bizz.

Lista unificada em `/pessoas`, criação em `/pessoas/novo` e edição em `/pessoas/:id`. Busca, relacionamento, tipo de pessoa, situação e página ficam na URL e são preservados no retorno. Os filtros de relacionamento e tipo preenchem valores iniciais de novos cadastros, sem sobrescrever os de registros existentes. As antigas URLs de clientes e fornecedores redirecionam para essas páginas, mantendo seu contexto. A navegação com alterações pendentes exige confirmação; modais ficam reservados a confirmações, sem conter o formulário de cadastro.

Antes de executar esta versão, aplique a migração `20261013180000_bizz_people_directory`. Ela adiciona campos opcionais de endereço e remove somente a restrição de relacionamento obrigatório; não remove nem recria registros. A API mantém o contrato anterior de cliente/fornecedor, inclusive a repetição de requisições de criação sem endereço.

A migração `20261013210000_bizz_contact_methods` cria as listas de telefones/e-mails a partir dos campos existentes, mantendo os dados legados. Publique a migração e a API compatível antes do novo frontend. O relacionamento usa um dropdown com caixas de seleção; telefones e e-mails têm ações de adicionar/remover linhas, sem criar cadastros separados.
