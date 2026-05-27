export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const response = Reflect.get(error, 'response')
    if (typeof response === 'object' && response !== null) {
      const data = Reflect.get(response, 'data')
      if (typeof data === 'object' && data !== null) {
        const message = Reflect.get(data, 'error')
        if (typeof message === 'string' && message.trim()) {
          return message
        }
      }
    }

    const message = Reflect.get(error, 'message')
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }

  return fallback
}

export function getErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) {
    return null
  }

  const response = Reflect.get(error, 'response')
  if (typeof response !== 'object' || response === null) {
    return null
  }

  const status = Reflect.get(response, 'status')
  return typeof status === 'number' ? status : null
}
