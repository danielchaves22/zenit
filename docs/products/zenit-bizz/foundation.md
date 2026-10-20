---
title: Zenit Bizz — acesso e cadastros
slug: /docs/products/zenit-bizz/foundation
type: technical-spec
product: zenit-bizz
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-10-20
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

O endereço é composto por CEP, logradouro, número, complemento, bairro, cidade, estado e país. Nesta etapa, novos endereços atendem ao Brasil: estado e cidade são selecionados do catálogo descrito abaixo. Não há consulta externa de CEP. Campos de endereço omitidos na edição preservam seus valores. Os identificadores e relacionamentos dos registros existentes permanecem os mesmos. Papéis personalizados são uma etapa posterior.

### Múltiplos endereços

Pessoas e empresas podem ter até 20 endereços, com identificação opcional (por exemplo, Entrega ou Cobrança). A inclusão e edição acontecem na própria página do cadastro, em blocos recolhíveis. O primeiro endereço da lista é o principal; a ação **Definir como principal** altera a ordem sem trocar os IDs dos endereços. Remover o principal promove o próximo endereço. A remoção de um endereço preenchido exige confirmação e só é gravada ao salvar o cadastro. A proteção de alterações não salvas inclui todos os endereços.

`BizzContactAddress` guarda os endereços vinculados ao cadastro, com índice único por cadastro e posição. A empresa é determinada pelo cadastro pai. `addresses` é uma lista ordenada no `POST/PUT /api/bizz/contacts`: cada item contém identificação (`label`), os campos de endereço e `location`; itens existentes enviam seu `id`, novos itens o omitem. IDs de outro cadastro ou empresa, IDs repetidos, endereços vazios e cidades incompatíveis com o estado são rejeitados. As alterações da lista e da versão do cadastro são atômicas. `addresses: []` remove todos os endereços; omitir a lista mantém compatibilidade com o formato anterior.

Os campos de endereço na raiz de `BizzContact` continuam refletindo o principal. Uma edição legada altera somente esse endereço, preservando os adicionais; omitir todos os campos de endereço os preserva. A lista explícita prevalece sobre os campos legados. A migração `20261015120000_bizz_contact_addresses` copia o endereço atual para o primeiro item sem remover nem corrigir os textos antigos. Endereços sem correspondência no IBGE continuam editáveis em outros campos e podem ser corrigidos por seleção. Publique as migrações e a API antes do frontend.

O identificador permanece estável após edição/inativação e é referenciado pelas compras. A integração financeira está descrita na seção de compras abaixo.

Telefones e e-mails são listas ordenadas (`phones` e `emails`), com até 20 valores de cada tipo. Linhas vazias do formulário não são enviadas. O servidor valida cada valor e rejeita repetições no mesmo cadastro (e-mail sem distinção de maiúsculas; telefone ignorando a pontuação). A busca considera também os valores adicionais.

CPF, CNPJ (inclusive alfanumérico) e telefones brasileiros têm máscaras no formulário. A pontuação é de apresentação; documentos permanecem normalizados na API. Telefones internacionais ou com ramal já cadastrados não são truncados. Adicionar/remover e-mails mantém os demais valores e a ordem dos contatos.

### Estados e municípios

`GeographyService` é um serviço de referência global do backend, independente de empresa e aplicação. Usa uma cópia versionada da [API de localidades do IBGE](https://servicodados.ibge.gov.br/api/docs/localidades), em `backend/src/data/brazil-geography.json`: 27 estados e 5.571 municípios na consulta de 13/10/2026. Não chama o IBGE durante a operação do usuário e não duplica o catálogo por empresa. O Admin não precisa de uma tela de manutenção manual nesta etapa; uma futura rotina de atualização pertence à administração da plataforma.

As rotas autenticadas `GET /api/bizz/geography/states` e `GET /api/bizz/geography/states/:uf/cities` expõem o serviço respeitando o acesso efetivo ao Bizz. Novos consumidores podem reutilizar o serviço sob suas próprias regras de acesso, sem ampliar as permissões do Bizz.

`GET /api/bizz/geography/postal-codes/:cep` consulta o [ViaCEP](https://viacep.com.br/) no backend, sob as mesmas regras de acesso ao Bizz. Aceita CEP brasileiro com oito dígitos, com ou sem hífen, e retorna `postalCode`, `street`, `neighborhood` e `location: { stateCode, cityCode }`. O CEP da resposta precisa corresponder ao solicitado e a combinação UF/código IBGE deve existir no catálogo local. A consulta tem limite de cinco segundos e cache em memória de até 500 resultados válidos por uma hora. CEP inválido retorna 400; inexistente, 404; falha do provedor ou dados incompatíveis, 503. Não exige chave, variável de ambiente ou migração.

Ao editar um CEP completo, o formulário consulta após uma pausa de 400 ms e preenche logradouro, bairro, estado e cidade. Todos permanecem ajustáveis. Abrir um cadastro existente não dispara consulta nem altera seus dados. Número, complemento e identificação permanecem intactos; respostas sem logradouro/bairro não apagam esses campos. Correções feitas durante a consulta são preservadas, assim como os endereços adicionais. Consultas antigas são descartadas ao mudar CEP/empresa, remover o endereço ou iniciar a gravação. Falhas permitem nova tentativa e preenchimento manual, sem bloquear o salvamento.

O formulário envia `location: { stateCode, cityCode }`, com código UF e código IBGE do município; ambos aceitam `null`. O backend valida a combinação e grava os nomes oficiais e `cityIbgeCode`. Mudar o estado limpa a cidade. Textos digitados na busca apenas filtram as opções; não criam localidades. Não há seleção de outros países nesta versão.

Endereços legados são associados apenas quando a combinação de país, estado e nome da cidade tem correspondência inequívoca. Os textos antigos não são alterados pela migração. Um registro sem correspondência mantém o endereço durante edições de outros campos; a interface apresenta esse endereço para correção por seleção. Chamadas legadas que alterem cidade/estado precisam informar uma combinação reconhecida. Repetições de criação continuam verificando o conteúdo original antes de normalizar os nomes.

A migração aditiva `20261015100000_bizz_contact_geography` acrescenta o código opcional do município. Aplique a migração e publique a API antes do frontend. Para atualizar o catálogo, execute na raiz `node backend/scripts/update-brazil-geography.cjs`, revise o diff e a procedência, execute os testes de geografia e publique o backend. O script só consulta os endpoints públicos do IBGE e atualiza o arquivo versionado; não acessa o banco. Remoções ou substituições de códigos exigem avaliar os cadastros existentes antes da publicação.

`BizzContactMethod` armazena os valores vinculados ao cadastro; a empresa é resolvida pelo cadastro pai. A gravação das listas e da versão ocorre na mesma transação. Os campos legados `phone` e `email` continuam refletindo o primeiro valor. Listas explícitas substituem os respectivos valores; listas vazias os removem. Uma edição legada que envie apenas o campo singular substitui ou remove o primeiro valor, preservando os adicionais. Omissão de ambos os formatos preserva os valores na edição. Se os dois formatos forem enviados, prevalece a lista.

- `GET /api/bizz/contacts`: busca por `q`, relacionamento `customer|supplier|both|none|all`, tipo `personType=PERSON|BUSINESS|all`, situação `active|inactive|all` e página; 20 registros por página. Os filtros de cliente e fornecedor incluem quem tem ambos os relacionamentos.
- `GET /api/bizz/contacts/:id`: consulta individual para edição por URL; retorna 404 se o cadastro não pertencer à empresa ativa.
- `POST /api/bizz/contacts`: criação com `requestKey` UUID. Repetição da mesma tentativa retorna o registro existente; reuso da chave com dados diferentes retorna 409.
- `PUT /api/bizz/contacts/:id`: edição com a versão lida; alterações concorrentes retornam 409. Inclui inativação e reativação.
- `GET /api/bizz/session`: contexto da empresa validado pelo backend.

O servidor determina usuário/empresa e não aceita atribuição desses campos pelo formulário. Todas as consultas e atualizações são limitadas à empresa ativa. São preservados autor da criação, autor da última alteração, datas e versão; isso não é um histórico completo de revisões.

## Produtos e serviços

O catálogo em **Cadastros → Produtos e serviços** usa `/produtos-servicos`, `/produtos-servicos/novo` e `/produtos-servicos/:id`. Cada `BizzCatalogItem` pertence a uma empresa e registra nome, tipo `PRODUCT|SERVICE`, unidade, utilização em compra (`canPurchase`), venda (`canSell`) ou ambas, preço de venda de referência e situação. Nome e unidade são obrigatórios; pelo menos uma utilização precisa estar marcada. A unidade é texto com sugestões, sem conversões automáticas. Compras registram seus próprios preços efetivos; vendas e estoque são etapas posteriores.

O preço de referência é opcional, em reais, e aceita zero. É armazenado como `DECIMAL(14,2)` e transmitido em `salePrice` como string decimal canônica (`"1234.50"`) ou `null`. O formulário aceita vírgula decimal e agrupamento brasileiro (`1.234,50`). Valores negativos, mais de duas casas decimais e valores acima de `999999999999.99` são recusados. Alterar utilização não apaga um preço já informado. O preço é uma referência para operações futuras.

- `GET /api/bizz/catalog`: busca por nome (`q`), `kind=PRODUCT|SERVICE|all`, `usage=purchase|sale|both|all`, `status=active|inactive|all` e página. Compra/venda incluem os itens com ambas as utilizações. Cada página tem 20 registros ordenados por nome e ID.
- `GET /api/bizz/catalog/:id`: consulta para edição, limitada à empresa ativa.
- `POST /api/bizz/catalog`: criação com `requestKey` UUID; repetir os mesmos dados não duplica o registro, inclusive em requisições simultâneas.
- `PUT /api/bizz/catalog/:id`: edição com `version`; uma edição concorrente retorna 409. Inativação/reativação preservam o ID; não há exclusão definitiva na interface/API.

Os mesmos controles de acesso ao Bizz e de troca obrigatória de senha protegem o catálogo. Empresa e autores são determinados pelo servidor. A migração `20261014100000_bizz_catalog` adiciona uma tabela própria e não altera cadastros existentes. Publique a migração e a API antes do frontend.

## Interface

Tema claro, marca laranja `#F97316`, navegação retrátil, adaptação a telas pequenas e formulários com informações complementares recolhíveis. Botões preenchidos usam um tom mais escuro de laranja para legibilidade do texto. Estados vazios correspondem a dados reais; não há indicadores de vendas ou compras ainda não implementados.

Formulários preservam os dados após falha de gravação, confirmam descarte de alterações e impedem submissões simultâneas. Compras e parcelas usam a integração financeira descrita abaixo; o estado publicado depende da aplicação da migração e do deploy da API e do frontend.

Lista unificada em `/pessoas`, criação em `/pessoas/novo` e edição em `/pessoas/:id`. Busca, relacionamento, tipo de pessoa, situação e página ficam na URL e são preservados no retorno. Os filtros de relacionamento e tipo preenchem valores iniciais de novos cadastros, sem sobrescrever os de registros existentes. As antigas URLs de clientes e fornecedores redirecionam para essas páginas, mantendo seu contexto. A navegação com alterações pendentes exige confirmação; modais ficam reservados a confirmações, sem conter o formulário de cadastro.

Antes de executar esta versão, aplique a migração `20261013180000_bizz_people_directory`. Ela adiciona campos opcionais de endereço e remove somente a restrição de relacionamento obrigatório; não remove nem recria registros. A API mantém o contrato anterior de cliente/fornecedor, inclusive a repetição de requisições de criação sem endereço.

A migração `20261013210000_bizz_contact_methods` cria as listas de telefones/e-mails a partir dos campos existentes, mantendo os dados legados. Publique a migração e a API compatível antes do novo frontend. O relacionamento usa um dropdown com caixas de seleção; telefones e e-mails têm ações de adicionar/remover linhas, sem criar cadastros separados.

## Características de produtos

O Zenit Admin mantém características globais em **Características**; o Bizz apresenta as globais e as da empresa em **Cadastros → Características**. Os formulários usam páginas próprias e preservam busca, origem, situação e página no retorno. Há proteção para alterações não salvas. As características não são obrigatórias no cadastro de um produto.

Cada característica possui nome, descrição opcional, tipo e situação. Os tipos são lista de valores, texto e número; números admitem unidade opcional e até 12 dígitos inteiros e seis casas decimais. Tipo e unidade ficam definidos na criação pela interface. A API impede sua mudança depois de haver opções ou produtos vinculados.

`ProductAttribute.companyId = null` identifica uma definição global. Definições locais pertencem à empresa ativa, revalidada no backend. Em uma lista global, `ProductAttributeOption.companyId = null` identifica valores globais; a empresa pode acrescentar opções próprias sem alterar as globais nem expor suas opções a outras empresas. O Admin consulta e altera somente as definições e opções globais. O cadastro local acompanha a permissão efetiva de acesso ao Bizz, como os demais cadastros; não cria um novo papel de administração.

As rotas são `GET/POST /api/admin/product-attributes`, `GET/PUT /api/admin/product-attributes/:id`, com acesso exclusivo ao administrador global, e as equivalentes `/api/bizz/attributes` para a empresa. `PUT /api/bizz/attributes/:id/options` altera apenas as opções da empresa em uma característica global. O cliente envia a revisão recebida na leitura; a API rejeita alterações concorrentes da mesma empresa. Alterações de outra empresa não invalidam essa revisão. A versão da definição protege a edição global ou local.

Produtos usam `attributes`, uma lista opcional de até 50 entradas com `attributeId` e exatamente um de `optionId`, `textValue` ou `numberValue`. A API valida o tipo, a empresa e o vínculo entre opção e característica. Ausência do campo na edição preserva vínculos existentes; `[]` remove todos. A atualização do produto e dos vínculos é atômica. Os preços monetários mantêm seu contrato decimal anterior. Serviços não recebem características nesta etapa.

Cada característica aparece uma única vez no produto, com um único valor. Telefones, e-mails, endereços, opções de características e características atribuídas ao produto são apresentados em linhas de leitura. Adicionar ou editar abre os campos na própria página; o check confirma a linha e o cancelamento preserva o valor anterior. O botão Salvar grava o cadastro completo e fica indisponível enquanto houver uma linha em edição. Essas edições também participam da proteção contra saída sem salvar.

Inativar uma característica ou opção impede novas atribuições e preserva valores já utilizados. Opções persistidas são inativadas explicitamente, sem exclusão pela omissão em um formulário; renomear um valor usado com outro significado é bloqueado. Não são geradas variantes, combinações, estoque ou novos itens automaticamente, e as compras existentes não são alteradas.

Antes de disponibilizar os frontends, aplique a migração aditiva `20261020150000_product_attributes` e publique a API compatível. A migração cria três tabelas, índices parciais para unicidade dos registros globais e integridade de opções; não preenche características em produtos antigos nem cria um catálogo global inicial. O pacote `@zenit/product-attributes` compartilha o formulário, a listagem e os contratos de apresentação entre Admin e Bizz.

## Compras e integração financeira

**Operação → Compras** usa `/compras`, `/compras/nova` e `/compras/:id`. A lista mantém busca por fornecedor/número, situação e página na URL. A criação usa página própria e proteção de alterações não salvas. O pagamento de uma parcela e o cancelamento usam confirmações curtas.

Uma compra confirmada registra fornecedor ativo, data, itens ativos disponíveis para compra, quantidades (até três casas), preços unitários (duas casas) e observação opcional. Nome do fornecedor, nome/unidade dos itens e valores são preservados como retratos comerciais da operação. O backend calcula os totais com Decimal, arredondando cada item para centavos antes de somar; o navegador apresenta a mesma prévia com aritmética inteira.

Há de uma a 60 parcelas mensais. O Cash distribui centavos, destinando o resíduo à última parcela, e limita o dia ao último dia de cada mês. Conta prevista e primeiro vencimento são obrigatórios; categoria de despesa é opcional. Contas de cartão e contas gerenciadas pelo sistema não são aceitas nesta etapa.

A confirmação e a criação das parcelas pendentes acontecem na mesma transação do banco. `FinancialTransaction.bizzPurchaseId` vincula os próprios lançamentos financeiros; o Bizz não mantém uma cópia independente de seus estados. `originalAmount` preserva o compromisso original, enquanto `amount` e `paidAmount` representam o valor quitado. O total comercial permanece intacto quando há diferença no pagamento. Não há pagamento parcial: confirmar um valor diferente quita integralmente a parcela.

As rotas continuam em `/api/bizz/*`: `GET /purchases/options`, `GET/POST /purchases`, `GET /purchases/:id`, `POST /purchases/:id/installments/:transactionId/settle` e `POST /purchases/:id/cancel`. O acesso efetivo ao Bizz, a empresa ativa e a troca obrigatória de senha continuam obrigatórios. A empresa precisa ter Cash habilitado para criar, pagar ou cancelar. O usuário não precisa receber acesso à interface Cash: essas ações limitadas às compras respeitam o papel da associação à empresa e os acessos às contas já existentes. Usuários comuns precisam de acesso explícito tanto à conta prevista quanto à conta de pagamento. A seleção não retorna saldos; nomes de contas sem acesso não são expostos na consulta da compra.

Criação usa `requestKey` por empresa e comparação do conteúdo. Pagamento usa chave por compra, recibo de repetição/autor e `expectedUpdatedAt`. A parcela é bloqueada e relida antes da baixa; repetir a mesma tentativa não movimenta novamente o saldo. Alterações concorrentes exigem atualização. Efeitos de cache são publicados após o commit. A baixa utiliza o serviço financeiro comum, incluindo bloqueio de contas e validação de saldo negativo.

O Cash pode quitar essas mesmas parcelas, e a consulta/ação Atualizar no Bizz mostra o resultado atual. Campos comerciais não podem ser editados pela transação avulsa. Exclusão, arquivamento, reabertura e alteração do valor de uma parcela já paga são bloqueados. Uma compra inteiramente pendente pode ser cancelada pelo Bizz, cancelando todas as parcelas sem apagar o histórico. Após pagamento, cancelamento/estorno não faz parte desta entrega.

Esta primeira versão confirma a compra diretamente; não inclui rascunho, edição de compra confirmada, recebimento/estoque, cartão, devoluções, baixa parcial ou quitação em lote. Correções de compras ainda não pagas usam cancelamento e novo registro. Resets financeiros que tentem excluir lançamentos vinculados são impedidos pelas relações de integridade; não removê-las para contornar o histórico comercial.

Antes de executar, aplique `20261014130000_bizz_purchases` e publique a API antes do frontend. A migração adiciona as tabelas comerciais, recibos de repetição e uma coluna opcional nos lançamentos; não altera compras ou lançamentos existentes. Testes de integração devem usar exclusivamente uma base de teste dedicada.
