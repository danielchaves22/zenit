import { AssistantStreamEvent, assistantStreamEventSchema } from '@zenit/assistant-contracts';
import { fetch } from 'expo/fetch';
import { API_URL, APP_KEY } from '@/constants/app';
import { useAuthStore } from '@/store/auth-store';

function parseEventBlock(block: string): AssistantStreamEvent | null {
  const lines = block.split('\n');
  let eventName = '';
  let data = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
    }
    if (line.startsWith('data:')) {
      data += line.slice('data:'.length).trim();
    }
  }

  if (!eventName || !data) {
    return null;
  }

  const parsed = JSON.parse(data);
  return assistantStreamEventSchema.parse(parsed);
}

export async function streamAssistantTurn(params: {
  sessionId: number;
  message: string;
  onEvent: (event: AssistantStreamEvent) => void;
}) {
  const state = useAuthStore.getState();
  if (!state.token || !state.companyId) {
    throw new Error('Sessao autenticada nao encontrada');
  }

  const response = await fetch(`${API_URL}/assistant/sessions/${params.sessionId}/messages/stream`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`,
      'X-App-Key': APP_KEY,
      'X-Company-Id': String(state.companyId)
    },
    body: JSON.stringify({
      message: params.message
    })
  });

  if (!response.ok) {
    const raw = await response.text();
    const parsed = raw ? JSON.parse(raw) : null;
    throw new Error(parsed?.error || 'Falha ao iniciar streaming do assistente');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Fluxo SSE indisponivel nesta execucao');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let separatorIndex = buffer.indexOf('\n\n');

    while (separatorIndex !== -1) {
      const block = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const event = parseEventBlock(block);
      if (event) {
        params.onEvent(event);
      }
      separatorIndex = buffer.indexOf('\n\n');
    }
  }

  if (buffer.trim()) {
    const event = parseEventBlock(buffer.trim());
    if (event) {
      params.onEvent(event);
    }
  }
}
