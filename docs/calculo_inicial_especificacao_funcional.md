# Especificação Funcional: Cálculo Inicial

## Objetivo
Implementar no ZenitCalc a feature de **cálculo inicial** como uma prévia estruturada do passivo de um processo.

O cálculo inicial deve:
- partir de um **processo** existente;
- respeitar o fluxo atual de status (`SOLICITACAO`, `INICIAL`, `CALCULO`);
- permitir entrada manual de dados ou uso de processo originado por importação;
- calcular verbas, reflexos, multas e honorários sem depender de planilha;
- preservar rastreabilidade de entradas, regra aplicada e resultado gerado.

## Premissas de Domínio

### Processo como entidade raiz
O cálculo inicial é sempre vinculado a um `Process`.

O processo já existe no sistema com:
- `status`: `SOLICITACAO`, `INICIAL`, `CALCULO`
- `originType`: `MANUAL` ou `IMPORT`
- `sourceImportId` quando vier de importação

### Solicitação é a primeira etapa
A feature deve respeitar o fluxo:
1. criação da **solicitação** do processo;
2. preenchimento ou revisão dos dados do processo;
3. abertura do **cálculo inicial**;
4. revisão/publicação do cálculo inicial;
5. transição futura para cálculo oficial.

### Manual ou importado
O processo pode nascer de duas formas:
- `MANUAL`: criado diretamente na tela de processos;
- `IMPORT`: criado ou vinculado a partir de `InboundImport`.

Importação não deve significar cálculo automático completo. Ela apenas:
- cria ou referencia o processo;
- pré-preenche dados que existirem;
- mantém rastreabilidade com a origem.

## Escopo da Feature

### Incluído agora
- gestão da solicitação como etapa anterior ao cálculo;
- cadastro dos insumos do cálculo inicial;
- seleção do regime de FGTS (`8%` ou `11,2%`);
- cálculo das verbas com base em regras de domínio;
- visão resumida e detalhada do resultado;
- versionamento básico do cálculo inicial;
- publicação do cálculo inicial como estado do processo.

### Fora do escopo agora
- cálculo oficial completo;
- geração automática integral a partir do conteúdo de importação;
- parser de planilha Excel como fonte de execução;
- edição colaborativa simultânea;
- motor de fórmulas configurável pelo usuário final.

## Fluxo Funcional

### 1. Solicitação
Usuário cria ou recebe um processo.

Campos mínimos existentes:
- advogado solicitante;
- reclamante;
- observações;
- tags;
- origem manual/importada.

Regras:
- novo processo nasce em `SOLICITACAO`;
- `originType=IMPORT` exige vínculo rastreável com `sourceImportId`;
- a solicitação pode existir sem cálculo.

### 2. Abertura do cálculo inicial
Dentro do processo, usuário inicia um cálculo inicial.

Comportamento:
- processo em `SOLICITACAO` pode receber cálculo inicial;
- ao salvar a primeira versão publicada do cálculo, processo pode ser promovido para `INICIAL`;
- novas revisões do cálculo inicial não mudam o processo para `CALCULO`.

### 3. Preenchimento dos insumos
Usuário informa os dados do caso.

Os insumos devem ser separados por blocos:
- identificação do vínculo;
- bases salariais;
- parâmetros rescisórios;
- verbas mensais integráveis;
- jornada e adicionais;
- verbas indenizatórias/especiais;
- parâmetros de FGTS e honorários.

### 4. Processamento
Sistema executa o motor de cálculo.

Saídas:
- resumo geral;
- blocos detalhados por verba;
- totais;
- honorários;
- valor devido pelo empregador.

### 5. Revisão e publicação
Usuário revisa o cálculo.

Estados sugeridos para a versão:
- `DRAFT`: ainda editável;
- `PUBLISHED`: versão considerada vigente no processo;
- `SUPERSEDED`: versão antiga substituída por outra.

## Regra de Negócio Observada

## Regra-base
O cálculo inicial é um agregador de verbas trabalhistas por grupos.

Padrões recorrentes:
- cálculo de principal;
- cálculo de reflexo em `13°`;
- cálculo de reflexo em `férias + 1/3`;
- cálculo de reflexo em `aviso prévio` quando aplicável;
- cálculo de reflexo em `DSR` quando aplicável;
- cálculo de `FGTS`;
- subtotal do grupo.

## Base de remuneração
`remuneração` não é apenas salário base.

A base observada na planilha é composta por:
- salário base;
- vale alimentação integração;
- salário extrafolha;
- equiparação salarial;
- acúmulo de função;
- diferença salarial;
- periculosidade sobre salário base;
- insalubridade sobre salário mínimo;
- comissão integração;
- gorjetas integração;
- gratificações integração.

## Grupos de cálculo

### Verbas rescisórias
Itens observados:
- aviso prévio;
- 13° sobre aviso;
- férias sobre aviso;
- 13° proporcional;
- férias proporcionais;
- saldo de salário;
- FGTS sobre verbas rescisórias;
- multa de 40%.

### Verbas mensais integráveis
Itens observados:
- vale alimentação pagamento;
- vale alimentação integração;
- salário extrafolha;
- equiparação salarial;
- acúmulo de função;
- diferença salarial;
- comissão pagamento;
- comissão integração;
- gorjetas pagamento;
- gorjetas integração;
- gratificações pagamento;
- gratificações integração.

### Jornada e adicionais
Itens observados:
- periculosidade;
- insalubridade;
- adicional noturno;
- horas extras;
- intrajornada;
- interjornada;
- intervalo da mulher;
- intersemanal;
- labor em dia de folga;
- DSR após o 7º dia;
- domingo e feriado;
- domingo;
- feriado;
- sobreaviso;
- descanso semanal remunerado.

### Indenizatórias e especiais
Itens observados:
- invalidade da dispensa;
- estabilidade;
- dispensa discriminatória;
- danos morais;
- danos morais valor fixo;
- assédio moral;
- danos materiais vencida;
- danos materiais vincenda;
- custeio do tratamento;
- parcela indenizatória;
- multa art. 467;
- multa art. 477;
- honorários.

## Regras de FGTS

### Conclusão prática
O sistema não deve tratar o regime como um único multiplicador global.

Há pelo menos três comportamentos distintos:

### 1. FGTS do regime da aba
Varia conforme o cálculo:
- `8%`
- `11,2%`

Esse percentual alimenta os blocos normais de reflexo de FGTS.

### 2. Base fixa de 8% para multa de 40%
A multa de 40% observada na planilha usa base fixa de `8%`, inclusive na versão `11,2%`.

Portanto:
- `fgtsPenaltyBaseRate = 0.08`
- `multa40 = remuneracao * meses_fgts_devidos * 0.08 * 0.40`

### 3. Exceções com FGTS fixo de 8%
Alguns blocos especiais observados na planilha usam `8%` fixo, mesmo fora da aba `8%`.

Hoje os indícios mais claros são:
- invalidade da dispensa - reintegração;
- dispensa discriminatória - reintegração.

Essas exceções devem ser modeladas como regra explícita, não como efeito colateral de planilha.

## Regras técnicas que devem virar helpers

### Helpers de base
- `remuneracao`
- `salarioMinimoPorAno`
- `valorDia = remuneracao / 30`
- `valorMes = remuneracao`
- `valorHora = remuneracao / cargaMensal`
- `fatorFerias = 1 + 1/3`
- `fgtsRegimeRate`
- `fgtsPenaltyBaseRate = 0.08`

### Helpers de proporção
- `avos13`
- `avosFerias`
- `diasAviso`
- `diasSaldoSalario`
- `meses`

### Helpers de pagamento prévio
Toda verba que tiver campo “recebido” deve usar:
- `valorDevido = max(calculado - recebido, 0)` se o produto quiser travar negativo em zero;
- ou `valorDevido = calculado - recebido` se o jurídico quiser enxergar saldo negativo.

Essa decisão precisa ser fixada antes da implementação final.

## Lista de Insumos Recomendados

### Identificação do processo
- `processId`
- `regimeFgts` com enum `FGTS_8` e `FGTS_11_2`
- `requestingLawyerName`
- `claimantName`
- `notes`

### Vínculo
- `dataAdmissao`
- `dataDemissao`
- `meses`

Observação:
- `meses` deve continuar editável manualmente, mesmo que exista cálculo automático sugestivo.

### Bases salariais
- `salarioBase`
- `salarioMinimoAno`
- `salarioMinimo`
- `cargaMensal`

### Verbas rescisórias
- `diasAvisoPrevio`
- `avisoPrevioRecebido`
- `avos13SobreAviso`
- `valor13SobreAvisoRecebido`
- `avosFeriasSobreAviso`
- `valorFeriasSobreAvisoRecebido`
- `avos13Rescisorio`
- `valor13RescisorioRecebido`
- `avosFeriasRescisorio`
- `valorFeriasRescisorioRecebido`
- `diasSaldoSalario`
- `valorSaldoSalarioRecebido`
- `mesesFgtsDevidosParaMulta40`

### Verbas mensais integráveis
- `valeAlimentacaoPagamento`
- `valeAlimentacaoIntegracao`
- `salarioExtrafolha`
- `equiparacaoSalarial`
- `acumuloFuncao`
- `diferencaSalarial`
- `comissaoPagamento`
- `comissaoIntegracao`
- `gorjetasPagamento`
- `gorjetasIntegracao`
- `gratificacaoPagamento`
- `gratificacaoIntegracao`

### Jornada e adicionais
- `periculosidadeGrau`
- `periculosidadeMeses`
- `insalubridadeGrau`
- `insalubridadeMeses`
- `adicionalNoturnoPercentual`
- `horasNoturnasQuantidade`
- `adicionalHoraExtraPercentual`
- `adicional7166384Percentual`
- `adicionalDomingoFeriadoDsrPercentual`
- `horasExtrasQuantidade`
- `intrajornadaQuantidade`
- `interjornadaQuantidade`
- `intervaloMulherQuantidade`
- `intersemanalQuantidade`
- `laborNaFolgaQuantidade`
- `dsrAposSetimoDiaQuantidade`
- `domingoFeriadoQuantidade`
- `domingoQuantidade`
- `feriadoQuantidade`
- `sobreavisoQuantidade`
- `descansoSemanalRemuneradoFlag`

### Indenizatórias e especiais
- `danosMorais`
- `assedioMoral`
- `danosMoraisValorFixo`
- `parcelaIndenizatoria`
- `feriasQuantidadeAvos`
- `decimoTerceiroQuantidadeAvos`
- `fgtsMesesDevidos`
- `invalidadeDispensaReintegracaoMeses`
- `invalidadeDispensaIndenizacaoMeses`
- `estabilidadeMeses`
- `dispensaDiscriminatoriaReintegracaoMeses`
- `dispensaDiscriminatoriaSucessivoMeses`
- `danosMateriaisVencidaMeses`
- `danosMateriaisVincendaMeses`
- `custeioTratamento12Meses`
- `multa467Flag`
- `multa477Flag`
- `honorariosPercentual`

## Regras de Implementação

### Motor de cálculo
Não usar planilha ou fórmula textual como fonte de execução.

Implementar motor em TypeScript com:
- funções puras;
- catálogo fixo de rubricas;
- helpers comuns;
- resultado determinístico;
- versionamento de regra.

### Estrutura sugerida do motor
- `catalog.ts`: enum e metadados das rubricas;
- `helpers.ts`: bases, percentuais, arredondamento e lookup de salário mínimo;
- `groups/*.ts`: grupos de cálculo;
- `engine.ts`: orquestra grupos, resumo e totais;
- `types.ts`: inputs e outputs tipados.

### Saída padronizada
Cada rubrica deve devolver:
- `code`
- `group`
- `label`
- `kind` (`PRINCIPAL`, `REFLEXO_13`, `REFLEXO_FERIAS`, `REFLEXO_AVISO`, `REFLEXO_DSR`, `FGTS`, `MULTA`, `TOTAL`)
- `amount`
- `memory` opcional com a fórmula explicada em linguagem de sistema

## Modelo de Dados Proposto

### Reaproveitar
Usar `Process` como raiz.

Não criar entidade paralela para solicitação.

### Novas entidades

#### `InitialCalculation`
Container do cálculo inicial do processo.

Campos sugeridos:
- `id`
- `processId`
- `companyId`
- `currentVersionId`
- `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`)
- `createdBy`
- `updatedBy`
- `createdAt`
- `updatedAt`

Regra:
- um processo pode ter um container de cálculo inicial;
- o container pode ter múltiplas versões.

#### `InitialCalculationVersion`
Snapshot completo de uma execução do cálculo.

Campos sugeridos:
- `id`
- `initialCalculationId`
- `versionNumber`
- `ruleVersion`
- `fgtsRegime` (`FGTS_8`, `FGTS_11_2`)
- `inputSnapshot` em JSON
- `resultSummary` em JSON
- `resultBreakdown` em JSON
- `publishedAt`
- `createdBy`
- `createdAt`

Observação:
- `inputSnapshot` evita acoplamento excessivo com dezenas de colunas;
- `resultBreakdown` deve conter os grupos e linhas calculadas;
- `resultSummary` deve conter totais consumidos rapidamente na UI.

#### `InitialCalculationAudit`
Opcional, mas recomendável se houver rastreabilidade forte.

Campos sugeridos:
- `id`
- `initialCalculationVersionId`
- `action`
- `payload`
- `createdBy`
- `createdAt`

## Regras de Status do Processo

### Criação
- processo novo continua em `SOLICITACAO`;
- origem pode ser `MANUAL` ou `IMPORT`.

### Publicação do cálculo inicial
- ao publicar a primeira versão válida do cálculo inicial, processo muda para `INICIAL`;
- se já estiver em `INICIAL`, apenas atualiza a versão publicada;
- cálculo inicial não promove automaticamente para `CALCULO`.

### Cálculo oficial no futuro
- `CALCULO` fica reservado para a etapa seguinte, não tratada aqui.

## API Proposta

### Processo/Solicitação
Reaproveitar:
- `POST /processes`
- `GET /processes`
- `GET /processes/:id`
- `PUT /processes/:id`
- `PATCH /processes/:id/status`

### Cálculo inicial

#### Criar container ou primeira versão
- `POST /processes/:id/initial-calculations`

Payload:
- `fgtsRegime`
- `inputs`
- `publish` opcional

#### Recalcular
- `POST /processes/:id/initial-calculations/:calculationId/versions`

Payload:
- `fgtsRegime`
- `inputs`
- `publish` opcional

#### Buscar cálculo atual
- `GET /processes/:id/initial-calculation`

#### Buscar histórico de versões
- `GET /processes/:id/initial-calculations/:calculationId/versions`

#### Publicar versão
- `PATCH /processes/:id/initial-calculations/:calculationId/versions/:versionId/publish`

## Frontend Proposto

### Processos
Manter a listagem atual.

Adicionar:
- ação de abrir cálculo inicial a partir da listagem;
- indicador visual quando existir cálculo inicial publicado.

### Tela de processo
A página atual de edição do processo pode evoluir para layout com seções:
- `Solicitação`
- `Cálculo Inicial`
- `Histórico`

### Tela de cálculo inicial
Sugestão de rota:
- `/processes/[id]/initial`

Blocos visuais:
- cabeçalho do processo;
- seleção de regime FGTS;
- formulário de insumos por seção;
- resumo lateral;
- memória de cálculo por grupo;
- ações `Salvar rascunho`, `Recalcular`, `Publicar`.

### Importação
Na tela de importações:
- processo importado deve permitir criar/vincular processo normalmente;
- após o vínculo, usuário segue o mesmo fluxo de cálculo inicial;
- importação não deve bypassar a etapa de solicitação.

## Critérios de Aceite

### Solicitação
- usuário consegue criar processo manualmente em `SOLICITACAO`;
- usuário consegue vincular processo a importação;
- processo importado mantém rastreabilidade com `sourceImportId`.

### Cálculo inicial
- usuário consegue abrir cálculo inicial a partir de um processo;
- usuário consegue salvar rascunho sem publicar;
- usuário consegue recalcular com nova entrada;
- usuário consegue publicar uma versão;
- processo vai para `INICIAL` ao publicar pela primeira vez.

### Regra de FGTS
- sistema suporta `8%` e `11,2%`;
- reflexos padrão usam o regime selecionado;
- multa de 40% continua usando base fixa de `8%`;
- exceções fixas em `8%` ficam codificadas explicitamente.

### Auditoria
- cada versão preserva inputs e outputs completos;
- recalcular não destrói a versão anterior;
- é possível saber qual regra gerou o resultado.

## Decisões recomendadas antes da implementação
- confirmar se valores negativos por “verba recebida maior que devida” devem ser permitidos;
- confirmar lista final de exceções de FGTS fixo em `8%`;
- confirmar se `meses` será apenas editável ou também sugerido automaticamente;
- confirmar quais campos importados podem pré-preencher a solicitação;
- confirmar se a publicação do cálculo inicial muda o status automaticamente ou com confirmação do usuário.
