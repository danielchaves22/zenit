import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AssistantHistoryMessage, AssistantTurnResponse, PendingAction } from '@zenit/assistant-contracts'
import { Bot, MessageCircle, Plus, Send, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/ToastContext'
import { Button } from '@/components/ui/Button'
import api from '@/lib/api'
import { streamAssistantTurn } from '@/lib/assistant-stream'
import { PendingActionCard } from './PendingActionCard'

type ChatItem = {
  id: string
  role: 'USER' | 'ASSISTANT'
  text: string
  pendingAction?: PendingAction | null
}

const STORAGE_KEY_PREFIX = 'zenit.cash.web.assistant.session'

function getStoredSessionId(companyId: number) {
  if (typeof window === 'undefined') {
    return null
  }

  const value = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}.${companyId}`)
  return value ? Number(value) : null
}

function storeSessionId(companyId: number, sessionId: number) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(`${STORAGE_KEY_PREFIX}.${companyId}`, String(sessionId))
}

function normalizeHistoryMessage(message: AssistantHistoryMessage): ChatItem | null {
  if (message.role !== 'USER' && message.role !== 'ASSISTANT') {
    return null
  }

  return {
    id: String(message.id),
    role: message.role,
    text: message.text,
    pendingAction: message.pendingAction ?? null
  }
}

async function createAssistantSession(companyId: number) {
  const response = await api.post('/assistant/sessions', {})
  const sessionId = Number(response.data.sessionId)
  storeSessionId(companyId, sessionId)
  return sessionId
}

async function ensureAssistantSession(companyId: number) {
  const stored = getStoredSessionId(companyId)
  if (stored) {
    return stored
  }

  return createAssistantSession(companyId)
}

export function AssistantFloatingChat() {
  const { companyId, user } = useAuth()
  const { addToast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [composerText, setComposerText] = useState('')
  const [messages, setMessages] = useState<ChatItem[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const [actionPendingId, setActionPendingId] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const baseUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL || '/api', [])

  const loadHistory = useCallback(
    async (nextSessionId: number) => {
      const response = await api.get(`/assistant/sessions/${nextSessionId}/history`)
      const history = response.data as { sessionId: number; messages: AssistantHistoryMessage[] }
      setMessages(history.messages.map(normalizeHistoryMessage).filter(Boolean) as ChatItem[])
      setHistoryLoaded(true)
    },
    []
  )

  const bootstrapSession = useCallback(async () => {
    if (!companyId) {
      return
    }

    setIsBootstrapping(true)
    try {
      const nextSessionId = await ensureAssistantSession(companyId)
      setSessionId(nextSessionId)
      await loadHistory(nextSessionId)
    } finally {
      setIsBootstrapping(false)
    }
  }, [companyId, loadHistory])

  useEffect(() => {
    if (!isOpen || !companyId || historyLoaded || isBootstrapping) {
      return
    }

    void bootstrapSession().catch((error) => {
      const message = error instanceof Error ? error.message : 'Falha ao abrir o assistente.'
      addToast(message, 'error')
    })
  }, [addToast, bootstrapSession, companyId, historyLoaded, isBootstrapping, isOpen])

  useEffect(() => {
    setSessionId(null)
    setMessages([])
    setComposerText('')
    setHistoryLoaded(false)
    setIsBootstrapping(false)
    setActionPendingId(null)
  }, [companyId])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const container = scrollRef.current
    if (!container) {
      return
    }

    container.scrollTop = container.scrollHeight
  }, [isOpen, messages])

  async function handleNewConversation() {
    if (!companyId || isStreaming) {
      return
    }

    try {
      setIsBootstrapping(true)
      const nextSessionId = await createAssistantSession(companyId)
      setSessionId(nextSessionId)
      setMessages([])
      setComposerText('')
      setHistoryLoaded(true)
      setActionPendingId(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao criar nova conversa.'
      addToast(message, 'error')
    } finally {
      setIsBootstrapping(false)
    }
  }

  async function updatePendingAction(
    pendingActionId: number,
    operation: 'confirm' | 'cancel'
  ) {
    setActionPendingId(pendingActionId)
    try {
      const response = await api.post(`/assistant/pending-actions/${pendingActionId}/${operation}`)
      const updatedPendingAction = response.data.pendingAction as PendingAction

      setMessages((current) =>
        current.map((message) =>
          message.pendingAction?.id === pendingActionId
            ? {
                ...message,
                pendingAction: updatedPendingAction,
                text:
                  operation === 'confirm'
                    ? `${message.text}\n\nLancamento confirmado com sucesso.`
                    : `${message.text}\n\nRascunho cancelado.`
              }
            : message
        )
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Falha ao ${operation === 'confirm' ? 'confirmar' : 'cancelar'} o rascunho.`
      addToast(message, 'error')
    } finally {
      setActionPendingId(null)
    }
  }

  async function handleSend() {
    if (!companyId || !sessionId || !composerText.trim() || isStreaming) {
      return
    }

    const messageText = composerText.trim()
    const localUserMessageId = `web-user-${Date.now()}`
    const localAssistantMessageId = `web-assistant-${Date.now()}`

    setComposerText('')
    setIsStreaming(true)
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
    ])

    try {
      await streamAssistantTurn({
        baseUrl,
        sessionId,
        message: messageText,
        onEvent: (event) => {
          if (event.type === 'message.delta' && event.delta) {
            setMessages((current) =>
              current.map((message) =>
                message.id === localAssistantMessageId
                  ? {
                      ...message,
                      text: `${message.text}${event.delta}`
                    }
                  : message
              )
            )
          }

          if (event.type === 'message.completed' && event.response) {
            const response = event.response as AssistantTurnResponse
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
            )
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
            )
          }
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao conversar com o assistente.'
      addToast(message, 'error')
      setMessages((current) =>
        current.map((item) =>
          item.id === localAssistantMessageId
            ? {
                ...item,
                text: message
              }
            : item
        )
      )
    } finally {
      setIsStreaming(false)
    }
  }

  const canUseAssistant = Boolean(user && companyId)
  const canSend = Boolean(sessionId && composerText.trim() && !isStreaming && !isBootstrapping)

  if (!canUseAssistant) {
    return null
  }

  return (
    <>
      {isOpen ? (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" onClick={() => setIsOpen(false)} />
      ) : null}

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
        {isOpen ? (
          <div className="flex h-[min(78vh,720px)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] border border-gray-700 bg-surface shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-700 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-white">
                  <Bot size={18} className="text-accent" />
                  <h3 className="text-lg font-semibold">Operador</h3>
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Lance despesas, receitas e transferencias em linguagem natural.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleNewConversation()}
                  disabled={isStreaming || isBootstrapping}
                  className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 transition hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <Plus size={14} />
                    Nova conversa
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl border border-gray-700 p-2 text-gray-300 transition hover:border-accent hover:text-accent"
                  aria-label="Fechar assistente"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-background/80 px-4 py-4">
              {!historyLoaded && isBootstrapping ? (
                <div className="rounded-3xl border border-gray-700 bg-surface px-4 py-3 text-sm text-gray-400">
                  Carregando conversa...
                </div>
              ) : null}

              {historyLoaded && messages.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-gray-700 bg-surface/70 px-4 py-5 text-sm text-gray-400">
                  Descreva um lancamento como <span className="text-white">gastei 42 no Uber hoje no Nubank</span>.
                </div>
              ) : null}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === 'USER'
                      ? 'ml-auto max-w-[88%] rounded-[24px] bg-[#102130] px-4 py-3 text-sm text-[#f7f8fa]'
                      : 'max-w-[96%] rounded-[24px] bg-white px-4 py-3 text-sm text-[#1d232c]'
                  }
                >
                  <div className="whitespace-pre-wrap leading-6">
                    {message.text || (isStreaming && message.role === 'ASSISTANT' ? '...' : '')}
                  </div>

                  {message.role === 'ASSISTANT' && message.pendingAction ? (
                    <PendingActionCard
                      pendingAction={message.pendingAction}
                      loading={actionPendingId === message.pendingAction.id}
                      onConfirm={(pendingActionId) => updatePendingAction(pendingActionId, 'confirm')}
                      onCancel={(pendingActionId) => updatePendingAction(pendingActionId, 'cancel')}
                    />
                  ) : null}
                </div>
              ))}
            </div>

            <div className="border-t border-gray-700 bg-surface px-4 py-4">
              <div className="rounded-[24px] border border-gray-700 bg-white p-3">
                <textarea
                  value={composerText}
                  onChange={(event) => setComposerText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void handleSend()
                    }
                  }}
                  placeholder="Ex.: gastei 42 no Uber hoje no Nubank"
                  className="min-h-[76px] w-full resize-none border-0 bg-transparent text-sm text-[#1d232c] outline-none placeholder:text-[#8490a1]"
                />

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-gray-500">
                    {isStreaming ? 'Processando mensagem...' : 'Enter envia · Shift+Enter quebra linha'}
                  </div>

                  <Button
                    variant="accent"
                    disabled={!canSend}
                    onClick={() => void handleSend()}
                    className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send size={14} />
                    {isStreaming ? 'Enviando...' : 'Enviar'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[var(--color-primary-shadow)] transition hover:scale-[1.03] hover:bg-accent-hover"
          aria-label={isOpen ? 'Fechar assistente' : 'Abrir assistente'}
        >
          <MessageCircle size={22} />
        </button>
      </div>
    </>
  )
}
