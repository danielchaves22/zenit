// frontend/lib/api.ts - VERSÃO CORRIGIDA
import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
})

api.interceptors.request.use(config => {
  // Usar o novo nome do token com prefixo específico
  const token = localStorage.getItem('zenit_token')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api