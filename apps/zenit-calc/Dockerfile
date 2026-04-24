FROM node:20-alpine

WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Install system deps required by some npm packages during install/build.
RUN apk add --no-cache python3 make g++

# Install dependencies from monorepo root lockfile/workspaces.
COPY package*.json ./
COPY apps/zenit-admin/package.json ./apps/zenit-admin/package.json
COPY apps/zenit-calc/package.json ./apps/zenit-calc/package.json
COPY apps/zenit-cash/package.json ./apps/zenit-cash/package.json
COPY backend/package.json ./backend/package.json
COPY packages/shared-users-core/package.json ./packages/shared-users-core/package.json
RUN npm ci

# Copy source and build only zenit-calc workspace.
COPY . .
RUN npm --workspace apps/zenit-calc run build

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "--workspace", "apps/zenit-calc", "run", "start"]
