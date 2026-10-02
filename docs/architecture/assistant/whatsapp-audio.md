---
title: Áudio e confirmação no canal financeiro
slug: /docs/architecture/assistant/whatsapp-audio
type: technical-spec
product: zenit-cash
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-10-02
summary: Transcrição no caminho direto do Cash e relação com o ingresso pelo Hub.
---

# Áudio e confirmação no canal financeiro

O usuário pode enviar uma mensagem de voz ou texto para iniciar um pedido e para corrigir um rascunho antes da confirmação. O agente responde por texto, com o resumo e os botões Confirmar/Cancelar. **Somente o botão Confirmar grava o lançamento no WhatsApp.** Dizer ou escrever "confirmar" apresenta novamente o botão; a tool de confirmação não fica disponível ao modelo neste canal e o executor também bloqueia sua execução.

Uma correção mantém a mesma sessão e o mesmo rascunho. Campos nulos da tool de atualização significam "preservar". A revisão muda após cada atualização, invalidando os botões do resumo anterior. Uma correção que não puder ser resolvida pede esclarecimento, sem apresentar o resumo antigo como se tivesse sido corrigido. A edição de lançamentos já confirmados não faz parte deste fluxo.

## Escopo deste documento

O ingresso atual pelo WhatsApp é o Hub: ele transcreve uma vez, escolhe o domínio e encaminha pedidos financeiros ao Cash como texto. O processamento abaixo descreve o endpoint direto do Cash e o envelope de áudio mantido por compatibilidade na ponte. Não ocorre uma segunda transcrição quando o Hub envia texto. Consulte a [ponte Cash–Hub](zenit-hub-extraction.md). As regras de rascunho e confirmação por botão valem em ambos os caminhos.

## Processamento no caminho direto do Cash

1. Validar assinatura, identificar remetente, vínculo, empresa e acesso ao canal.
2. Registrar o ID único da mensagem antes do processamento; reentregas não transcrevem nem executam novamente.
3. Acionar o indicador de digitação durante download, transcrição e processamento do agente.
4. Recuperar a mídia da Meta usando `phone_number_id`, validar host, tamanho e hash, sem seguir redirecionamentos com a credencial.
5. Transcrever com a credencial OpenAI ativa da empresa e encaminhar o texto ao fluxo atual do assistente, preservando autorização de contas e histórico. Nomes de até 20 contas ativas autorizadas para esse usuário servem como dicas de vocabulário; saldos e contas sem permissão não são enviados à transcrição.
6. Responder em texto e oferecer confirmação por botão.

O arquivo fica somente em memória. Não é salvo no servidor. A transcrição integra o histórico da conversa e o registro da mensagem, como ocorre com o texto digitado; logs operacionais incluem apenas metadados, nunca o áudio, a transcrição, URLs de download ou credenciais.

## Configuração e limites

- Reutiliza as credenciais existentes da Meta e da OpenAI; não exige alteração do webhook nem do modelo de conversa.
- `WHATSAPP_TRANSCRIPTION_MODEL`: padrão `gpt-transcribe`, independente do modelo do agente. Transcrição em português. Para modelos legados, o campo de idioma segue o contrato anterior da API.
- Até 16 MB, com limite aplicado também durante o download; transcrições acima de 6.000 caracteres são recusadas, sem truncar o pedido.
- Mensagens de voz OGG/Opus, MP3, M4A/MP4, WAV, WebM e FLAC. Arquivos em outros formatos recebem orientação para gravar pelo microfone do WhatsApp ou enviar texto.
- Falhas de mídia/transcrição pedem um novo áudio ou texto sem executar o pedido. Não há retry automático que possa duplicar operações.
- A confirmação por botão vale somente para o WhatsApp; outros canais preservam seu comportamento anterior.

## Validação

Os testes cobrem autorização antes da transcrição, arquivo multipart, falhas sem vazamento de conteúdo, limites de download, deduplicação, revisão de botões, preservação de campos e bloqueio de confirmação por voz/texto. A integração com banco de teste percorre áudio → rascunho → correção por áudio → botão antigo recusado → confirmação revisada → exatamente um lançamento.

Referências: [Meta: recuperar mídia](https://www.postman.com/meta/whatsapp-business-platform/request/fpj02x0/retrieve-media-url), [OpenAI: transcrição](https://developers.openai.com/api/docs/guides/speech-to-text), [contrato de formatos](https://developers.openai.com/api/reference/cli/resources/audio/subresources/transcriptions/methods/create).
