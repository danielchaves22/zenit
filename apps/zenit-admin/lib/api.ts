import axios from 'axios'
import { SSO_STORAGE_KEYS } from '@zenit/shared-users-core'

const envApiUrl = process.env.NEXT_PUBLIC_API_URL
const finalBaseUrl = envApiUrl || '/api'
const APP_KEY = process.env.NEXT_PUBLIC_APP_KEY || 'zenit-admin'

const api = axios.create({
  baseURL: finalBaseUrl
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem(SSO_STORAGE_KEYS.token)
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }

  const companyId = localStorage.getItem(SSO_STORAGE_KEYS.companyId)
  if (companyId && config.headers && !config.headers['X-Company-Id']) {
    config.headers['X-Company-Id'] = companyId
  }

  if (config.headers) {
    config.headers['X-App-Key'] = APP_KEY
  }

  return config
})

api.interceptors.response.use(
  response => response,
  error => Promise.reject(error)
)

export default api
