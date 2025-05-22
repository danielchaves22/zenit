#!/bin/sh
set -e

# Esperar pelo banco de dados
echo "Aguardando o banco de dados iniciar..."
while ! nc -z db 5432; do
  sleep 0.5
done
echo "Banco de dados disponível!"

# Verificar se o banco de dados existe e criar se necessário
echo "Verificando se o banco 'zenit' existe..."
DB_EXISTS=$(PGPASSWORD=${DB_PASSWORD:-postgres} psql -h db -U ${DB_USER:-postgres} -tAc "SELECT 1 FROM pg_database WHERE datname='zenit'" || echo "")
if [ -z "$DB_EXISTS" ]; then
  echo "Banco 'zenit' não existe. Criando..."
  PGPASSWORD=${DB_PASSWORD:-postgres} psql -h db -U ${DB_USER:-postgres} -c "CREATE DATABASE zenit"
fi
echo "Banco 'zenit' disponível!"

# Aplicar migrações Prisma
echo "Aplicando migrações Prisma..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

# Executar seed se existir - com mais verificações
echo "Verificando se seed deve ser executado..."
if [ -f "./prisma/seed.js" ]; then
  echo "Arquivo seed.js encontrado. Verificando se já existem dados..."
  
  # Verificar se já existem dados na tabela User
  USER_COUNT=$(PGPASSWORD=${DB_PASSWORD:-postgres} psql -h db -U ${DB_USER:-postgres} -d zenit -tAc "SELECT COUNT(*) FROM \"User\";" || echo "0")
  
  if [ "$USER_COUNT" = "0" ]; then
    echo "Nenhum usuário encontrado. Executando seed..."
    npx prisma db seed
    echo "Seed executado com sucesso!"
  else
    echo "Dados já existem ($USER_COUNT usuários). Pulando seed."
  fi
else
  echo "Arquivo seed.js não encontrado. Pulando seed."
fi

# Iniciar a aplicação
echo "Iniciando a aplicação..."
node dist/server.js