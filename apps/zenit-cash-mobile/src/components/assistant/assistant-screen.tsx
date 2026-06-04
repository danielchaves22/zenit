import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AssistantHistoryMessage, AssistantTurnResponse, PendingAction } from '@zenit/assistant-contracts';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import api from '@/lib/api-client';
import { appendCachedMessage, cacheRemoteSessionId, getCachedRemoteSessionId, replaceCachedHistory, upsertPendingAction } from '@/lib/database';
import { streamAssistantTurn } from '@/lib/assistant-stream';
import { useAuthStore } from '@/store/auth-store';
import { useUiStore } from '@/store/ui-store';
import { PendingActionCard } from './pending-action-card';

type ChatItem = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  text: string;
  pendingAction?: PendingAction | null;
};

async function ensureAssistantSession(companyId: number) {
  const cachedSessionId = await getCachedRemoteSessionId(companyId);
  if (cachedSessionId) {
    return cachedSessionId;
  }

  const response = await api.post('/assistant/sessions', {});
  const remoteSessionId = Number(response.data.sessionId);
  await cacheRemoteSessionId(companyId, remoteSessionId);
  return remoteSessionId;
}

export function AssistantScreen() {
  const companyId = useAuthStore((state) => state.companyId);
  const composerText = useUiStore((state) => state.assistantComposerText);
  const setComposerText = useUiStore((state) => state.setAssistantComposerText);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (!companyId) {
      return;
    }

    let mounted = true;
    ensureAssistantSession(companyId).then((remoteSessionId) => {
      if (mounted) {
        setSessionId(remoteSessionId);
      }
    });

    return () => {
      mounted = false;
    };
  }, [companyId]);

  const historyQuery = useQuery({
    queryKey: ['assistant-history', companyId, sessionId],
    enabled: !!companyId && !!sessionId,
    queryFn: async () => {
      const response = await api.get(`/assistant/sessions/${sessionId}/history`);
      const history = response.data as { sessionId: number; messages: AssistantHistoryMessage[] };
      if (companyId && sessionId) {
        await replaceCachedHistory(companyId, sessionId, history.messages);
      }

      return history;
    }
  });

  useEffect(() => {
    if (!historyQuery.data) {
      return;
    }

    setMessages(
      historyQuery.data.messages.map((message) => ({
        id: String(message.id),
        role: message.role === 'USER' ? 'USER' : 'ASSISTANT',
        text: message.text,
        pendingAction: message.pendingAction ?? null
      }))
    );
  }, [historyQuery.data]);

  const confirmMutation = useMutation({
    mutationFn: async (pendingActionId: number) => {
      const response = await api.post(`/assistant/pending-actions/${pendingActionId}/confirm`);
      return response.data;
    },
    onSuccess: async (payload, pendingActionId) => {
      const updatedPendingAction = payload.pendingAction as PendingAction;
      if (companyId && sessionId) {
        await upsertPendingAction({ companyId, remoteSessionId: sessionId, pendingAction: updatedPendingAction });
      }

      setMessages((current) =>
        current.map((message) =>
          message.pendingAction?.id === pendingActionId
            ? {
                ...message,
                pendingAction: updatedPendingAction,
                text: `${message.text}\n\nLancamento confirmado com sucesso.`
              }
            : message
        )
      );
    }
  });

  const cancelMutation = useMutation({
    mutationFn: async (pendingActionId: number) => {
      const response = await api.post(`/assistant/pending-actions/${pendingActionId}/cancel`);
      return response.data;
    },
    onSuccess: async (payload, pendingActionId) => {
      const updatedPendingAction = payload.pendingAction as PendingAction;
      if (companyId && sessionId) {
        await upsertPendingAction({ companyId, remoteSessionId: sessionId, pendingAction: updatedPendingAction });
      }

      setMessages((current) =>
        current.map((message) =>
          message.pendingAction?.id === pendingActionId
            ? {
                ...message,
                pendingAction: updatedPendingAction,
                text: `${message.text}\n\nRascunho cancelado.`
              }
            : message
        )
      );
    }
  });

  const canSend = useMemo(
    () => !!sessionId && !!companyId && composerText.trim().length > 0 && !isStreaming,
    [companyId, composerText, isStreaming, sessionId]
  );

  const handleSend = async () => {
    if (!companyId || !sessionId || !composerText.trim()) {
      return;
    }

    const messageText = composerText.trim();
    const localUserMessageId = `local-user-${Date.now()}`;
    const localAssistantMessageId = `local-assistant-${Date.now()}`;
    setComposerText('');
    setIsStreaming(true);

    setMessages((current) => [
      ...current,
      {
        id: localUserMessageId,
        role: 'USER',
        text: messageText
      },
      {
        id: localAssistantMessageId,
        role: 'ASSISTANT',
        text: ''
      }
    ]);

    await appendCachedMessage({
      localId: localUserMessageId,
      companyId,
      remoteSessionId: sessionId,
      role: 'USER',
      text: messageText,
      createdAt: new Date().toISOString()
    });

    try {
      await streamAssistantTurn({
        sessionId,
        message: messageText,
        onEvent: async (event) => {
          if (event.type === 'message.delta' && event.delta) {
            setMessages((current) =>
              current.map((message) =>
                message.id === localAssistantMessageId
                  ? { ...message, text: `${message.text}${event.delta}` }
                  : message
              )
            );
          }

          if (event.type === 'message.completed' && event.response) {
            const response = event.response as AssistantTurnResponse;
            setMessages((current) =>
              current.map((message) =>
                message.id === localAssistantMessageId
                  ? {
                      ...message,
                      text: response.message,
                      pendingAction: response.pendingAction ?? null
                    }
                  : message
              )
            );

            await appendCachedMessage({
              localId: `${response.assistantTurnId}`,
              companyId,
              remoteSessionId: sessionId,
              role: 'ASSISTANT',
              text: response.message,
              createdAt: new Date().toISOString(),
              pendingAction: response.pendingAction ?? null
            });
          }

          if (event.type === 'pending_action.created' && event.pendingAction) {
            await upsertPendingAction({
              companyId,
              remoteSessionId: sessionId,
              pendingAction: event.pendingAction
            });
          }

          if (event.type === 'turn.error') {
            setMessages((current) =>
              current.map((message) =>
                message.id === localAssistantMessageId
                  ? {
                      ...message,
                      text: event.error || 'Falha ao processar a mensagem.'
                    }
                  : message
              )
            );
          }
        }
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Operador</Text>
        <Text style={styles.subtitle}>
          Descreva uma despesa, receita ou transferencia. O assistente monta o rascunho e voce confirma.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.messages}>
        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.messageBubble,
              message.role === 'USER' ? styles.userBubble : styles.assistantBubble
            ]}
          >
            <Text
              style={[
                styles.messageText,
                message.role === 'USER' ? styles.userText : styles.assistantText
              ]}
            >
              {message.text || (isStreaming && message.role === 'ASSISTANT' ? '...' : '')}
            </Text>

            {message.role === 'ASSISTANT' && message.pendingAction ? (
              <PendingActionCard
                pendingAction={message.pendingAction}
                onConfirm={async (pendingActionId) => confirmMutation.mutateAsync(pendingActionId)}
                onCancel={async (pendingActionId) => cancelMutation.mutateAsync(pendingActionId)}
              />
            ) : null}
          </View>
        ))}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          multiline
          onChangeText={setComposerText}
          placeholder="Ex.: gastei 42 no Uber hoje no Nubank"
          placeholderTextColor="#8490a1"
          style={styles.input}
          value={composerText}
        />
        <Pressable disabled={!canSend} onPress={handleSend} style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}>
          <Text style={styles.sendLabel}>{isStreaming ? 'Enviando...' : 'Enviar'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#eef1f4',
    flex: 1,
    gap: 12,
    padding: 16
  },
  header: {
    backgroundColor: '#102130',
    borderRadius: 28,
    gap: 8,
    padding: 20
  },
  title: {
    color: '#f7f8fa',
    fontSize: 28,
    fontWeight: '700'
  },
  subtitle: {
    color: '#c9d2de',
    fontSize: 14,
    lineHeight: 21
  },
  messages: {
    gap: 12,
    paddingBottom: 8
  },
  messageBubble: {
    borderRadius: 24,
    padding: 16
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#102130',
    maxWidth: '88%'
  },
  assistantBubble: {
    alignSelf: 'stretch',
    backgroundColor: '#ffffff'
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22
  },
  userText: {
    color: '#f7f8fa'
  },
  assistantText: {
    color: '#1d232c'
  },
  composer: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    gap: 12,
    padding: 14
  },
  input: {
    color: '#1d232c',
    fontSize: 16,
    maxHeight: 120,
    minHeight: 54,
    textAlignVertical: 'top'
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#8fd6b5',
    borderRadius: 16,
    paddingVertical: 14
  },
  sendButtonDisabled: {
    opacity: 0.45
  },
  sendLabel: {
    color: '#101318',
    fontSize: 15,
    fontWeight: '700'
  }
});
