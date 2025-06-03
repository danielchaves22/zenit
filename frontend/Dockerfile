# 1. Imagem base leve
FROM node:20-alpine

# 2. Define a working directory
WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ARG NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_ENV=$NODE_ENV

# 3. Copia package.json e lockfile 
COPY package*.json ./

# 4. Instala deps
RUN npm ci

# 5. Copia todo o código
COPY . .

# 6. Faz o build do Next.js
RUN npm run build

# 7. Expõe a porta 3000 (padrão do Next)
EXPOSE 3000

# 8. Start em modo produção
CMD ["npm", "start"]
