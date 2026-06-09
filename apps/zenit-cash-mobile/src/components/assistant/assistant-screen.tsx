import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AssistantHistoryMessage, AssistantTurnResponse, PendingAction } from '@zenit/assistant-contracts';
import type { ExpoSpeechRecognitionErrorEvent, ExpoSpeechRecognitionResultEvent } from 'expo-speech-recognition';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import api from '@/lib/api-client';
import { appendCachedMessage, cacheRemoteSessionId, getCachedRemoteSessionId, replaceCachedHistory, upsertPendingAction } from '@/lib/database';
import { streamAssistantTurn } from '@/lib/assistant-stream';
import { useAuthStore } from '@/store/auth-store';
import { useUiStore } from '@/store/ui-store';
import { PendingActionCard } from './pending-action-card';

type SpeechRecognitionPackage = typeof import('expo-speech-recognition');

type ChatItem = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  text: string;
  pendingAction?: PendingAction | null;
};

function loadSpeechRecognitionPackage(): SpeechRecognitionPackage | null {
  try {
    return require('expo-speech-recognition') as SpeechRecognitionPackage;
  } catch {
    return null;
  }
}

function appendTranscriptToText(currentText: string, transcript: string) {
  const normalizedTranscript = transcript.trim();
  if (!normalizedTranscript) {
    return currentText;
  }

  const trimmedCurrentText = currentText.trim();
  return trimmedCurrentText ? `${trimmedCurrentText} ${normalizedTranscript}` : normalizedTranscript;
}

function getSpeechRecognitionErrorMessage(event: ExpoSpeechRecognitionErrorEvent) {
  switch (event.error) {
    case 'not-allowed':
      return 'Permissao de microfone ou reconhecimento de fala nao concedida.';
    case 'no-speech':
    case 'speech-timeout':
      return 'Nao consegui entender a fala. Tente novamente falando mais perto do microfone.';
    case 'service-not-allowed':
      return 'O reconhecimento de voz nao esta disponivel neste aparelho.';
    case 'network':
      return 'Falha de rede durante a transcricao por voz.';
    default:
      return event.message || 'Falha ao transcrever a fala.';
  }
}

async function ensureAssistantSession(companyId: number) {
  const cachedSessionId = await getCachedRemoteSessionId(companyId);
  if (cachedSessionId) {
    return cachedSessionId;
  }

  return createAssistantSession(companyId);
}

async function createAssistantSession(companyId: number) {
  const response = await api.post('/assistant/sessions', {});
  const remoteSessionId = Number(response.data.sessionId);
  await cacheRemoteSessionId(companyId, remoteSessionId);
  return remoteSessionId;
}

export function AssistantScreen() {
  const companyId = useAuthStore((state) => state.companyId);
  const user = useAuthStore((state) => state.user);
  const composerText = useUiStore((state) => state.assistantComposerText);
  const setComposerText = useUiStore((state) => state.setAssistantComposerText);
  const speechRecognition = useMemo(() => loadSpeechRecognitionPackage(), []);
  const composerTextRef = useRef(composerText);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechDraft, setSpeechDraft] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const company = user?.companies.find((item) => item.id === companyId) || null;

  useEffect(() => {
    composerTextRef.current = composerText;
  }, [composerText]);

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

  useEffect(() => {
    if (!speechRecognition) {
      return;
    }

    const speechModule = speechRecognition.ExpoSpeechRecognitionModule;

    const startSubscription = speechModule.addListener('start', () => {
      setIsListening(true);
      setSpeechDraft('');
      setSpeechError(null);
    });

    const endSubscription = speechModule.addListener('end', () => {
      setIsListening(false);
      setSpeechDraft('');
    });

    const resultSubscription = speechModule.addListener('result', (event: ExpoSpeechRecognitionResultEvent) => {
      const transcript = event.results[0]?.transcript?.trim();
      if (!transcript) {
        return;
      }

      if (event.isFinal) {
        const nextValue = appendTranscriptToText(composerTextRef.current, transcript);
        composerTextRef.current = nextValue;
        setComposerText(nextValue);
        setSpeechDraft('');
        return;
      }

      setSpeechDraft(transcript);
    });

    const errorSubscription = speechModule.addListener('error', (event: ExpoSpeechRecognitionErrorEvent) => {
      setIsListening(false);
      setSpeechDraft('');

      if (event.error === 'aborted') {
        return;
      }

      setSpeechError(getSpeechRecognitionErrorMessage(event));
    });

    return () => {
      startSubscription.remove();
      endSubscription.remove();
      resultSubscription.remove();
      errorSubscription.remove();

      try {
        speechModule.abort();
      } catch {
        // Ignore cleanup failures when the native recognizer is already inactive.
      }
    };
  }, [setComposerText, speechRecognition]);

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

  useEffect(() => {
    const timeout = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 40);

    return () => clearTimeout(timeout);
  }, [messages.length, isStreaming]);

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
    () => !!sessionId && !!companyId && composerText.trim().length > 0 && !isStreaming && !isListening,
    [companyId, composerText, isListening, isStreaming, sessionId]
  );

  const handleNewConversation = async () => {
    if (!companyId || isStreaming || isListening) {
      return;
    }

    const remoteSessionId = await createAssistantSession(companyId);
    setComposerText('');
    setSpeechDraft('');
    setSpeechError(null);
    setMessages([]);
    setSessionId(remoteSessionId);
  };

  const handleVoiceToggle = async () => {
    const speechModule = speechRecognition?.ExpoSpeechRecognitionModule;

    if (!speechModule) {
      setSpeechError('Entrada por voz requer um development build do app. No Expo Go, o microfone do chat nao fica disponivel.');
      return;
    }

    if (isListening) {
      speechModule.stop();
      return;
    }

    setSpeechError(null);
    setSpeechDraft('');

    if (!speechModule.isRecognitionAvailable()) {
      setSpeechError('O reconhecimento de voz nao esta disponivel neste aparelho.');
      return;
    }

    try {
      const permission = await speechModule.requestPermissionsAsync();
      if (!permission.granted) {
        setSpeechError('Permissao de microfone ou reconhecimento de fala nao concedida.');
        return;
      }

      speechModule.start({
        lang: 'pt-BR',
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
        maxAlternatives: 1,
        iosTaskHint: speechRecognition.TaskHintIOS.dictation
      });
    } catch (error) {
      setSpeechError(error instanceof Error ? error.message : 'Falha ao iniciar a gravacao por voz.');
    }
  };

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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      style={styles.container}
    >
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.title}>Novo lancamento</Text>
            <Text style={styles.subtitle}>{company ? company.name : 'Zenit Cash'}</Text>
          </View>
          <Pressable
            disabled={isStreaming || isListening}
            onPress={handleNewConversation}
            style={[styles.newConversationButton, (isStreaming || isListening) && styles.newConversationButtonDisabled]}
          >
            <Text style={styles.newConversationLabel}>Nova conversa</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
      >
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

        {isListening || speechDraft ? (
          <View style={styles.voiceDraft}>
            <Text style={styles.voiceDraftLabel}>
              {speechDraft ? `Ouvindo: ${speechDraft}` : 'Ouvindo...'}
            </Text>
          </View>
        ) : null}

        {speechError ? <Text style={styles.voiceError}>{speechError}</Text> : null}

        <View style={styles.composerActions}>
          <Pressable
            onPress={handleVoiceToggle}
            style={[styles.voiceButton, isListening && styles.voiceButtonActive]}
          >
            <Text style={[styles.voiceButtonLabel, isListening && styles.voiceButtonLabelActive]}>
              {isListening ? 'Parar voz' : 'Falar'}
            </Text>
          </Pressable>

          <Pressable disabled={!canSend} onPress={handleSend} style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}>
            <Text style={styles.sendLabel}>{isStreaming ? 'Enviando...' : 'Enviar'}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
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
  headerTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  headerTextBlock: {
    flex: 1,
    gap: 8
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
  newConversationButton: {
    backgroundColor: '#eff4fb',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  newConversationButtonDisabled: {
    opacity: 0.45
  },
  newConversationLabel: {
    color: '#142638',
    fontSize: 13,
    fontWeight: '700'
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
  composerActions: {
    flexDirection: 'row',
    gap: 10
  },
  input: {
    color: '#1d232c',
    fontSize: 16,
    maxHeight: 120,
    minHeight: 54,
    textAlignVertical: 'top'
  },
  voiceDraft: {
    backgroundColor: '#edf7f1',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  voiceDraftLabel: {
    color: '#204b35',
    fontSize: 13,
    lineHeight: 18
  },
  voiceError: {
    color: '#8b2f39',
    fontSize: 13,
    lineHeight: 18
  },
  voiceButton: {
    alignItems: 'center',
    borderColor: '#cad2dc',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 14
  },
  voiceButtonActive: {
    backgroundColor: '#102130',
    borderColor: '#102130'
  },
  voiceButtonLabel: {
    color: '#243040',
    fontSize: 15,
    fontWeight: '700'
  },
  voiceButtonLabelActive: {
    color: '#f7f8fa'
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#8fd6b5',
    borderRadius: 16,
    flex: 1,
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
