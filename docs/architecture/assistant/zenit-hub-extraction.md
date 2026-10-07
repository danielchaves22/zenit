---
title: Ponte do Cash para o Zenit Hub
slug: /docs/architecture/assistant/zenit-hub-extraction
type: technical-spec
product: zenit-cash
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-10-07
summary: Contrato autenticado, responsabilidades e compatibilidade do canal WhatsApp.
---

# Ponte do Cash para o Zenit Hub

O Hub passa a coordenar o canal WhatsApp e conecta outras aplicações. Esta mudança adiciona uma ponte ao Cash; os endpoints anteriores continuam funcionando durante a migração.

`POST /api/integrations/hub/bridge` é desabilitado enquanto `CASH_HUB_SHARED_SECRET` não tiver pelo menos 32 caracteres. O Hub usa o mesmo segredo e assina timestamp, nonce, método, caminho e corpo exato. Apenas requisições recentes são aceitas, com proteção de replay em processo. Uma implantação com múltiplas réplicas deve compartilhar a proteção de nonce; a deduplicação de mensagens fica no banco e funciona entre réplicas.

Operações:

- `status`: informa se o remetente tem vínculo validado e acesso vigente.
- `message`: executa o fluxo existente, incluindo QR Code, áudio, correção de rascunhos e confirmação de lançamento. Retorna textos, botões ou listas para o Hub enviar. O Cash não envia outra resposta para a Meta neste caminho.
- `query`: apenas a lista explícita de consultas financeiras para consolidação com outros domínios. Não aceita ferramentas de escrita.
- `disconnect`: remove o vínculo do remetente.

O Hub não informa ID de usuário, empresa ou papel. O Cash resolve tudo pelo vínculo existente, valida acesso ao canal e ao Cash, e conserva verificações de contas financeiras nas operações. A ponte é de primeira parte; o segredo confere confiança para atestar o remetente do canal, por isso deve ser isolado e nunca exposto a clientes ou modelos. HTTPS é obrigatório fora do desenvolvimento local.

No caminho atual, o Hub baixa e transcreve o áudio uma única vez, com contexto neutro, antes de selecionar Cash, Day ou Calendar. O Cash recebe texto transcrito com o mesmo remetente e ID da mensagem. Voz e texto seguem as mesmas autorizações e confirmações. Veja a [arquitetura do Hub](https://github.com/danielchaves22/zenit-hub/blob/master/docs/ARQUITETURA.md).

Para compatibilidade com o caminho anterior, `message` também recebe `text: ""` e `audio: { mediaId: "123..." }`. Não aceita URL de mídia, texto misturado nem `buttonId` no mesmo envelope. Somente nesse envelope legado o Cash reutiliza seu download e transcrição, com suas credenciais e sua verificação de permissões. Mantenha as credenciais Meta do Cash válidas para o mesmo número após migrar o webhook. O Hub aguarda até 240 segundos por mensagem; o proxy da ponte deve suportar esse tempo.

A sessão, o histórico e as revisões do rascunho permanecem no Cash. Pedidos de confirmação por voz/texto apenas reapresentam o botão. A ponte preserva `requireConfirmationButton: true`, não oferece a ferramenta de confirmação ao modelo e rejeita botões antigos ou de outros usuários. A integração com banco de teste cobre áudio inicial, correção de valor/conta, tentativa de confirmação por voz/texto, botão antigo recusado, botão atual e reentrega sem nova transcrição ou lançamento.

O `AsyncLocalStorage` isola a saída do fluxo Hub por requisição. O caminho anterior mantém envio e indicador de digitação. O assistente web/mobile continua usando o orquestrador existente. Mensagens Hub recebem recibo antes da execução, com ID único. Repetições recebem orientação para consultar o estado atual, sem executar efeitos novamente ou reproduzir dados privados de um recibo antigo: permissões de workspace/contas podem ter mudado. Falhas de resultado incerto não são executadas novamente automaticamente.

Não é necessário migrar o banco Cash. O registro de mensagens existente guarda os recibos. Registros antigos, operações em andamento, permissões revogadas e botões de outro usuário não autorizam uma nova execução.

## Escolha de categoria

Quando várias categorias forem plausíveis, as ferramentas de criação/correção recebem `categoryCandidateIds` com 2 a 10 IDs obtidos em `search_categories`. O Cash valida empresa e tipo e persiste `categoryOptions` no JSON do rascunho e do resumo; não há nova tabela ou migração. Uma categoria explícita ou uma única opção clara segue para a revisão habitual. Sem correspondência adequada, pede esclarecimento, sem selecionar a categoria padrão silenciosamente.

A resposta contém `list: { button, rows: [{ id, title, description }] }`, sem botões de confirmação. O Hub envia `interactive.type=list`; o ID de `list_reply` volta pelo campo legado `buttonId`. O prefixo `zenit:category` encaminha a seleção diretamente ao Cash, sem chamada à IA. O título vindo do WhatsApp nunca determina a escolha. Listas têm até 10 linhas; títulos até 24 caracteres e descrições até 72, incluindo a categoria pai quando existente. Para outra categoria ou cancelamento, o usuário pode escrever ou enviar áudio.

A seleção fica vinculada ao usuário, empresa, sessão, rascunho e revisão. O Cash revalida a categoria, atualiza o mesmo rascunho e emite novos botões. Escolhas antigas/repetidas e categorias fora da lista são recusadas; a confirmação é bloqueada no serviço enquanto houver opções pendentes. Alterar valor ou conta preserva a escolha pendente. Apenas Confirmar da revisão atual grava a transação.

Publique primeiro o suporte a listas do Hub e depois o Cash. O webhook direto do Cash também suporta listas; não é necessário criar template nem mudar configurações na Meta para essa resposta a uma mensagem do usuário.

Para ativar, publique a ponte, configure e teste o Hub, e só então troque o webhook na Meta. Preserve o número e o prefixo do QR Code. Não configure os dois backends para processar a mesma mensagem simultaneamente. Em rollback, restaure o callback anterior. Veja o README do repositório `zenit-hub` para o procedimento completo.
