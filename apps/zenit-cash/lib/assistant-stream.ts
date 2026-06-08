import { AssistantStreamEvent, assistantStreamEventSchema } from '@zenit/assistant-contracts'
import { buildSessionHeaders } from '@/lib/api-headers'

const APP_KEY = process.env.NEXT_PUBLIC_APP_KEY || 'zenit-cash'

function parseEventBlock(block: string): AssistantStreamEvent | null {
  const lines = block.split('\n')
  let eventName = ''
  let data = ''

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim()
    }
    if (line.startsWith('data:')) {
      data += line.slice('data:'.length).trim()
    }
  }

  if (!eventName || !data) {
    return null
  }

  return assistantStreamEventSchema.parse(JSON.parse(data))
}

export async function streamAssistantTurn(params: {
  baseUrl: string
  sessionId: number
  message: string
  onEvent: (event: AssistantStreamEvent) => void
}) {
  const storage = typeof window === 'undefined' ? null : window.localStorage
  const headers = buildSessionHeaders(storage, APP_KEY)

  const response = await fetch(`${params.baseUrl}/assistant/sessions/${params.sessionId}/messages/stream`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      message: params.message
    })
  })

  if (!response.ok) {
    const raw = await response.text()
    const parsed = raw ? JSON.parse(raw) : null
    throw new Error(parsed?.error || 'Falha ao iniciar streaming do assistente')
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Fluxo SSE indisponivel neste navegador')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    let separatorIndex = buffer.indexOf('\n\n')

    while (separatorIndex !== -1) {
      const block = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      const event = parseEventBlock(block)
      if (event) {
        params.onEvent(event)
      }
      separatorIndex = buffer.indexOf('\n\n')
    }
  }

  if (buffer.trim()) {
    const event = parseEventBlock(buffer.trim())
    if (event) {
      params.onEvent(event)
    }
  }
}
