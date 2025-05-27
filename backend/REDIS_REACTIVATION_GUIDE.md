# 🔴 Guia de Reativação do Redis

## 📊 Quando Reativar o Redis?

Reative o Redis quando você tiver:

- **Múltiplas instâncias** da aplicação rodando
- **+1000 usuários simultâneos** regulares
- **Rate limiting persistente** necessário entre reinicializações
- **Problemas de memória** com memory store
- **Cluster/Load Balancer** em produção

## ⚡ Passos para Reativação Completa

### 1. Configurar Variáveis de Ambiente

**Arquivo: `backend/.env`**
```bash
# Mudar de false para true
REDIS_ENABLED=true
REDIS_HOST="localhost"
REDIS_PORT="6379"
REDIS_PASSWORD="sua_senha_redis_aqui"  # Se necessário
```

**Arquivo: `backend/.env.docker`**
```bash
# Mudar de false para true
REDIS_ENABLED=true
REDIS_HOST="redis"
REDIS_PORT="6379"
```

### 2. Reativar Serviço Redis no Docker

**Arquivo: `docker-compose.yml`**

Descomente o bloco completo do Redis:

```yaml
# === Redis - REATIVADO ===
redis:
  image: redis:7-alpine
  container_name: zenit-redis
  ports:
    - "6379:6379"
  volumes:
    - ./backend/redis/redis.conf:/etc/redis/redis.conf:ro
  command: redis-server /etc/redis/redis.conf
  networks:
    - monitoring
  restart: unless-stopped
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 3
```

E adicione dependência no backend:

```yaml
backend:
  # ... outras configurações
  depends_on:
    db:
      condition: service_healthy
    redis:  # ADICIONAR ESTA LINHA
      condition: service_healthy
```

### 3. Instalação Local do Redis (Se Necessário)

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

**macOS:**
```bash
brew install redis
brew services start redis
```

**Windows:**
```bash
# Usar Docker ou WSL2
docker run -d -p 6379:6379 redis:7-alpine
```

### 4. Verificar Funcionamento

```bash
# Teste de conexão
redis-cli ping
# Deve retornar: PONG

# Ver logs da aplicação
docker-compose logs backend | grep -i redis
# Deve mostrar: "Redis connected successfully"
```

### 5. Monitoramento

Verifique o endpoint de status:
```bash
curl http://localhost:3000/health
```

Deve mostrar:
```json
{
  "redis": {
    "enabled": true,
    "connected": true,
    "client": "ready"
  }
}
```

## 🚀 Benefícios Após Reativação

- ✅ **Rate limiting persistente** entre reinicializações
- ✅ **Compartilhamento** entre múltiplas instâncias
- ✅ **Performance** superior com grandes volumes
- ✅ **Escalabilidade** para crescimento futuro

## 🔧 Configurações Avançadas (Opcionais)

### Redis com Senha (Produção)

**Arquivo: `backend/redis/redis.conf`**
```
requirepass sua_senha_super_segura_aqui
```

**Arquivo: `.env`**
```bash
REDIS_PASSWORD="sua_senha_super_segura_aqui"
```

### Redis Cluster (Alta Disponibilidade)

Para aplicações críticas, considere Redis Cluster ou Sentinel para failover automático.

## ⚠️ Troubleshooting

### Redis não conecta:
1. Verificar se Redis está rodando: `docker ps | grep redis`
2. Verificar logs: `docker-compose logs redis`
3. Testar conexão: `redis-cli -h localhost -p 6379 ping`

### Memory store não muda para Redis:
1. Verificar variável: `echo $REDIS_ENABLED`
2. Reiniciar aplicação completamente
3. Verificar logs de conexão Redis

### Performance não melhora:
- Redis só compensa com **volume alto**
- Memory store é mais rápido para **baixo volume**
- Considere monitorar métricas antes/depois

---

**💡 Lembre-se:** O memory store atual é **perfeitamente adequado** para a maioria dos casos de uso. Só reative Redis quando realmente precisar da escalabilidade adicional.