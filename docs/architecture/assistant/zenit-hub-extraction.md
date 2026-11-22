---
title: Ponte do Cash para o Zenit Hub
slug: /docs/architecture/assistant/zenit-hub-extraction
type: technical-spec
product: zenit-cash
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-10-22
summary: Contrato autenticado, responsabilidades e compatibilidade do canal WhatsApp.
---

# Ponte do Cash para o Zenit Hub

O Hub passa a coordenar o canal WhatsApp e conecta outras aplicações. Esta mudança adiciona uma ponte ao Cash; os endpoints anteriores continuam funcionando durante a migração.

`POST /api/integrations/hub/bridge` é desabilitado enquanto `CASH_HUB_SHARED_SECRET` não tiver pelo menos 32 caracteres. O Hub usa o mesmo segredo e assina timestamp, nonce, método, caminho e corpo exato. Apenas requisições recentes são aceitas, com proteção de replay em processo. Uma implantação com múltiplas réplicas deve compartilhar a proteção de nonce; a deduplicação de mensagens fica no banco e funciona entre réplicas.

Operações:

- `status` e `workspaces`: informam o workspace ativo e os workspaces autorizados, com acessos ao Cash e Bizz separados. `connected` indica acesso ao Cash no contexto ativo.
- `select_workspace`: seleciona um `workspaceId` autorizado para as próximas mensagens. Seleção inválida é recusada, sem fallback para outra empresa.
- `message`: executa o fluxo existente, incluindo QR Code, áudio, correção de rascunhos e confirmação de lançamento. Retorna textos, botões ou listas para o Hub enviar. O Cash não envia outra resposta para a Meta neste caminho.
- `query`: apenas a lista explícita de consultas financeiras para consolidação com outros domínios. Não aceita ferramentas de escrita.
- `disconnect`: remove o vínculo do remetente.

O Hub não informa ID de usuário ou papel. Em `message` e `query`, `workspaceId` é um seletor opcional para compatibilidade; o Hub atualizado o fixa no início da solicitação. O Cash resolve a identidade pelo vínculo existente, revalida a associação à empresa, acesso ao canal e ao Cash, e conserva verificações de contas financeiras. O seletor não concede acesso. Respostas financeiras incluem o workspace efetivo; mensagens exibem `Cash · Nome`. A ponte é de primeira parte; o segredo confere confiança para atestar o remetente do canal, por isso deve ser isolado e nunca exposto a clientes ou modelos. HTTPS é obrigatório fora do desenvolvimento local.

Os botões localizam o rascunho pelo usuário do vínculo, ID e revisão, e autorizam novamente seu workspace original, independentemente da seleção atual. A execução continua exigindo sessão, empresa e revisão coincidentes. Trocar workspace não move nem confirma um rascunho. O vínculo já possui sessões por empresa; não há migração Prisma. O Hub separa também seu histórico e fixa o workspace nas assinaturas do resumo diário. Veja [Workspaces](https://github.com/danielchaves22/zenit-hub/blob/master/docs/WORKSPACES.md). Para esta evolução, publique primeiro o backend compartilhado e depois o Hub com a migração 7. A seleção reconhece acesso ao Bizz, mas não cria suas ferramentas comerciais.

No caminho atual, o Hub baixa e transcreve o áudio uma única vez, com contexto neutro, antes de selecionar Cash, Day ou Calendar. O Cash recebe texto transcrito com o mesmo remetente e ID da mensagem. Voz e texto seguem as mesmas autorizações e confirmações. Veja a [arquitetura do Hub](https://github.com/danielchaves22/zenit-hub/blob/master/docs/ARQUITETURA.md).

Para compatibilidade com o caminho anterior, `message` também recebe `text: ""` e `audio: { mediaId: "123..." }`. Não aceita URL de mídia, texto misturado nem `buttonId` no mesmo envelope. Somente nesse envelope legado o Cash reutiliza seu download e transcrição, com suas credenciais e sua verificação de permissões. Mantenha as credenciais Meta do Cash válidas para o mesmo número após migrar o webhook. O Hub aguarda até 240 segundos por mensagem; o proxy da ponte deve suportar esse tempo.

A sessão, o histórico e as revisões do rascunho permanecem no Cash. Pedidos de confirmação por voz/texto apenas reapresentam o botão. A ponte preserva `requireConfirmationButton: true`, não oferece a ferramenta de confirmação ao modelo e rejeita botões antigos ou de outros usuários. A integração com banco de teste cobre áudio inicial, correção de valor/conta, tentativa de confirmação por voz/texto, botão antigo recusado, botão atual e reentrega sem nova transcrição ou lançamento.

O `AsyncLocalStorage` isola a saída do fluxo Hub por requisição. O caminho anterior mantém envio e indicador de digitação. O assistente web/mobile continua usando o orquestrador existente. Mensagens Hub recebem recibo antes da execução, com ID único. Repetições recebem orientação para consultar o estado atual, sem executar efeitos novamente ou reproduzir dados privados de um recibo antigo: permissões de workspace/contas podem ter mudado. Falhas de resultado incerto não são executadas novamente automaticamente.

Não é necessário migrar o banco Cash. O registro de mensagens existente guarda os recibos. Registros antigos, operações em andamento, permissões revogadas e botões de outro usuário não autorizam uma nova execução.

## Completar conta e categoria

O Cash conserva o lançamento como rascunho mesmo quando ainda falta conta ou categoria. `missingFields`, `fromAccountOptions` e `toAccountOptions` integram o JSON existente, sem migração. O valor, a descrição, as datas, as observações e as escolhas já feitas são preservados. Uma resposta curta por texto ou áudio deve atualizar o mesmo rascunho.

Conta indicada pelo usuário, uma conta padrão aplicável ou uma única conta elegível seguem diretamente para revisão. Havendo várias contas sem padrão, ou um nome de banco que identifica mais de uma, o Cash oferece as opções autorizadas. Não escolhe a primeira pela ordem do cadastro. Sem indicação de crédito, a resolução automática considera contas que não sejam cartão; um pedido explícito de cartão conserva esse contexto. Não havendo conta disponível, orienta a revisão do cadastro/permissões, sem liberar confirmação.

Quando faltarem conta e categoria, pergunta primeiro a conta de origem/destino, depois a categoria. As listas de conta usam até nove opções e uma linha de navegação quando necessário. IDs `zenit:account` e `zenit:accounts` transportam rascunho, revisão, origem/destino e seleção/página. O Hub já encaminha esses IDs ao Cash; seleção e paginação não chamam a IA. O nome exibido pelo cliente nunca determina a conta.

O Cash revalida usuário, área de trabalho, sessão, revisão, conta oferecida, situação ativa e permissão. A confirmação também revalida as contas e a categoria e recusa campos obrigatórios pendentes, mesmo que alguém tente reutilizar um botão. A revisão final só oferece **Confirmar** depois de resolver as pendências. Os demais canais do assistente usam o mesmo rascunho e podem completar os campos por texto; não exibem ação de confirmação para rascunhos incompletos.

### Categorias

Ao preparar um lançamento pelo WhatsApp sem categoria indicada pelo usuário, o Cash procura descrições semelhantes no histórico da mesma área de trabalho e do mesmo tipo de lançamento, respeitando a visibilidade das contas. Um histórico consistente pode preencher a categoria na prévia. Se mais de uma categoria for plausível, o usuário escolhe na lista. Quando o histórico é insuficiente, o assistente usa o catálogo de categorias. Uma categoria informada pelo usuário tem prioridade.

Quando várias categorias forem plausíveis, as ferramentas de criação/correção recebem `categoryCandidateIds` com 2 a 10 IDs obtidos em `search_categories`. O Cash valida empresa e tipo e persiste `categoryOptions` no JSON do rascunho e do resumo; não há nova tabela ou migração. Uma categoria explícita ou uma única opção clara segue para a revisão habitual. Sem correspondência adequada, pede esclarecimento, sem selecionar a categoria padrão silenciosamente.

A resposta contém `list: { button, rows: [{ id, title, description }] }`, sem botões de confirmação. O Hub envia `interactive.type=list`; o ID de `list_reply` volta pelo campo legado `buttonId`. O prefixo `zenit:category` encaminha a seleção diretamente ao Cash, sem chamada à IA. O título vindo do WhatsApp nunca determina a escolha. Listas têm até 10 linhas; títulos até 24 caracteres e descrições até 72, incluindo a categoria pai quando existente. Para outra categoria ou cancelamento, o usuário pode escrever ou enviar áudio.

A seleção fica vinculada ao usuário, empresa, sessão, rascunho e revisão. O Cash revalida a categoria, atualiza o mesmo rascunho e apresenta a próxima pendência ou a revisão final. Escolhas antigas/repetidas e categorias fora da lista são recusadas; a confirmação é bloqueada no serviço enquanto houver opções pendentes. Alterar valor ou conta preserva a escolha pendente. Apenas Confirmar da revisão atual grava a transação.

A hierarquia não exige pergunta por si só: uma subcategoria cuja descrição seja claramente adequada pode ser selecionada sem também oferecer o pai. Alternativas realmente distintas continuam exigindo escolha; não se adicionam sugestões fracas somente para preencher uma lista.

Publique primeiro o suporte a listas do Hub e depois o Cash. O webhook direto do Cash também suporta listas; não é necessário criar template nem mudar configurações na Meta para essa resposta a uma mensagem do usuário.

Para ativar, publique a ponte, configure e teste o Hub, e só então troque o webhook na Meta. Preserve o número e o prefixo do QR Code. Não configure os dois backends para processar a mesma mensagem simultaneamente. Em rollback, restaure o callback anterior. Veja o README do repositório `zenit-hub` para o procedimento completo.

## Validade dos rascunhos financeiros no WhatsApp

Cada usuário mantém no máximo um rascunho ativo por área de trabalho. Ele expira 30 minutos após a criação ou a última edição efetiva, inclusive se a conversa continuar. Reabrir o resumo e responder à pergunta sobre a intenção não renovam o prazo. O Cash verifica a validade no próximo acesso e novamente ao aplicar a edição ou a confirmação; não há tarefa agendada.

“Categoria Alimentação” responde à lista de categorias. Na revisão, “Conta Nubank Daniel” altera a conta do mesmo lançamento. Se o nome identificar mais de uma conta, o usuário esclarece qual deseja. A prévia atualizada mantém as demais escolhas, e a gravação exige o botão **Confirmar** dessa revisão.

Para trocar a descrição, o usuário pode responder, por exemplo, `Descrição fica "Almoço de domingo"`. O Cash copia o texto entre aspas para o rascunho e envia o resumo atualizado. A mesma forma funciona para a observação.

Com um rascunho ativo, uma mensagem como “80 reais, Nubank” oferece **Novo lançamento** ou **Corrigir anterior**. A escolha recupera a mensagem original (ou sua transcrição); o usuário não precisa repeti-la. Iniciar outro lançamento descarta o rascunho anterior sem gravá-lo e limpa seu contexto. Uma correção preserva os campos não alterados. Botões de escolha são de uso único e vinculados à pessoa, área, sessão e revisão. Para gravar, continua sendo obrigatório tocar em **Confirmar** no resumo válido.
