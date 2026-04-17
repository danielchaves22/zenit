import axios from 'axios'

// 🔍 LOG 1: Verificar variável de ambiente durante o build
const envApiUrl = process.env.NEXT_PUBLIC_API_URL;
const finalBaseUrl = envApiUrl || '/api';

console.log('🔍 [API Config] Environment variable:', envApiUrl);
console.log('🔍 [API Config] Final base URL:', finalBaseUrl);
console.log('🔍 [API Config] Node env:', process.env.NODE_ENV);

const api = axios.create({
  baseURL: finalBaseUrl,
})

// 🔍 LOG 2: Interceptar todas as requisições
api.interceptors.request.use(config => {
  const fullUrl = `${config.baseURL}${config.url}`;
  console.log('🚀 [REQUEST] Method:', config.method?.toUpperCase());
  console.log('🚀 [REQUEST] Base URL:', config.baseURL);
  console.log('🚀 [REQUEST] Endpoint:', config.url);
  console.log('🚀 [REQUEST] Full URL:', fullUrl);
  
  const token = localStorage.getItem('zenit_admin_token')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const companyId = localStorage.getItem('zenit_admin_company_id')
  if (companyId && config.headers && !config.headers['X-Company-Id']) {
    config.headers['X-Company-Id'] = companyId
  }
  return config
});

// 🔍 LOG 3: Interceptar todas as respostas (incluindo erros)
api.interceptors.response.use(
  response => {
    console.log('✅ [RESPONSE] Status:', response.status);
    console.log('✅ [RESPONSE] URL:', response.config.url);
    console.log('✅ [RESPONSE] Data:', response.data);
    return response;
  },
  error => {
    console.error('❌ [ERROR] Status:', error.response?.status);
    console.error('❌ [ERROR] URL:', error.config?.url);
    console.error('❌ [ERROR] Full URL:', `${error.config?.baseURL}${error.config?.url}`);
    console.error('❌ [ERROR] Response:', error.response?.data);
    console.error('❌ [ERROR] Message:', error.message);
    return Promise.reject(error);
  }
);

export default api

