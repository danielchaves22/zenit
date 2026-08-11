import axios from 'axios'
import { buildSessionHeaders } from '@/lib/api-headers'
import {
  clearExpiredSessionAndRedirect,
  isExpiredSessionError
} from '@/lib/session-expiration'

const envApiUrl = process.env.NEXT_PUBLIC_API_URL
const finalBaseUrl = envApiUrl || '/api'
const APP_KEY = process.env.NEXT_PUBLIC_APP_KEY || 'zenit-cash'

const api = axios.create({
  baseURL: finalBaseUrl
})

api.interceptors.request.use(config => {
  const storage = typeof window === 'undefined' ? null : window.localStorage
  const sessionHeaders = buildSessionHeaders(storage, APP_KEY)
  config.headers = {
    ...(config.headers ?? {}),
    ...sessionHeaders
  } as typeof config.headers

  return config
})

api.interceptors.response.use(
  response => response,
  error => {
    if (isExpiredSessionError(error)) {
      clearExpiredSessionAndRedirect()
    }

    return Promise.reject(error)
  }
)

export default api
