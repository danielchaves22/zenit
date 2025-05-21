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
DB_EXISTS=$(PGPASSWORD=${DB_PASSWORD:-postgres} psql -h db -U ${DB_USER:-postgres} -tAc "SELECT 1 FROM pg_database WHERE datname='zenit'")
if [ -z "$DB_EXISTS" ]; then
  echo "Banco 'zenit' não existe. Criando..."
  PGPASSWORD=${DB_PASSWORD:-postgres} psql -h db -U ${DB_USER:-postgres} -c "CREATE DATABASE zenit"
fi
echo "Banco 'zenit' disponível!"

# Aplicar migrações Prisma
echo "Aplicando migrações Prisma..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

# Executar seed se existir
if [ -f "./prisma/seed.ts" ]; then
  echo "Executando seed de dados..."
  npx prisma db seed
fi

# Iniciar a aplicação
echo "Iniciando a aplicação..."
node dist/server.js