# Ponte do Cash para o Zenit Hub

O Hub passa a coordenar o canal WhatsApp e conecta outras aplicações. Esta mudança adiciona uma ponte ao Cash; os endpoints anteriores continuam funcionando durante a migração.

`POST /api/integrations/hub/bridge` é desabilitado enquanto `CASH_HUB_SHARED_SECRET` não tiver pelo menos 32 caracteres. O Hub usa o mesmo segredo e assina timestamp, nonce, método, caminho e corpo exato. Apenas requisições recentes são aceitas, com proteção de replay em processo. Uma implantação com múltiplas réplicas deve compartilhar a proteção de nonce; a deduplicação de mensagens fica no banco e funciona entre réplicas.

Operações:

- `status`: informa se o remetente tem vínculo validado e acesso vigente.
- `message`: executa o fluxo existente, incluindo QR Code, áudio, correção de rascunhos e confirmação de lançamento. Retorna textos/botões para o Hub enviar. O Cash não envia outra resposta para a Meta neste caminho.
- `query`: apenas a lista explícita de consultas financeiras para consolidação com outros domínios. Não aceita ferramentas de escrita.
- `disconnect`: remove o vínculo do remetente.

O Hub não informa ID de usuário, empresa ou papel. O Cash resolve tudo pelo vínculo existente, valida acesso ao canal e ao Cash, e conserva verificações de contas financeiras nas operações. A ponte é de primeira parte; o segredo confere confiança para atestar o remetente do canal, por isso deve ser isolado e nunca exposto a clientes ou modelos. HTTPS é obrigatório fora do desenvolvimento local.

Para voz, `message` recebe `text: ""` e `audio: { mediaId: "123..." }`. Não aceita URL de mídia, texto misturado nem `buttonId` no mesmo envelope. O Cash reutiliza seu download e transcrição, com suas credenciais e sua verificação de permissões. Mantenha as credenciais Meta do Cash válidas para o mesmo número após migrar o webhook. O Hub aguarda até 240 segundos por mensagem; o proxy da ponte deve suportar esse tempo.

A sessão, o histórico e as revisões do rascunho permanecem no Cash. Pedidos de confirmação por voz/texto apenas reapresentam o botão. A ponte preserva `requireConfirmationButton: true`, não oferece a ferramenta de confirmação ao modelo e rejeita botões antigos ou de outros usuários. A integração com banco de teste cobre áudio inicial, correção de valor/conta, tentativa de confirmação por voz/texto, botão antigo recusado, botão atual e reentrega sem nova transcrição ou lançamento.

O `AsyncLocalStorage` isola a saída do fluxo Hub por requisição. O caminho anterior mantém envio e indicador de digitação. O assistente web/mobile continua usando o orquestrador existente. Mensagens Hub recebem recibo antes da execução, com ID único. Repetições recebem orientação para consultar o estado atual, sem executar efeitos novamente ou reproduzir dados privados de um recibo antigo: permissões de workspace/contas podem ter mudado. Falhas de resultado incerto não são executadas novamente automaticamente.

Não é necessário migrar o banco Cash. O registro de mensagens existente guarda os recibos. Registros antigos, operações em andamento, permissões revogadas e botões de outro usuário não autorizam uma nova execução.

Para ativar, publique a ponte, configure e teste o Hub, e só então troque o webhook na Meta. Preserve o número e o prefixo do QR Code. Não configure os dois backends para processar a mesma mensagem simultaneamente. Em rollback, restaure o callback anterior. Veja o README do repositório `zenit-hub` para o procedimento completo.
