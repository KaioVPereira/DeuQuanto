# Servidor de sincronização do Deu Quanto? — construído a partir da raiz do repositório
# (precisa de shared/, o contrato com o app). Sem npm install: não há dependências.
FROM node:24-alpine

WORKDIR /app
COPY shared/ ./shared/
COPY server/ ./server/
WORKDIR /app/server

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    APK_DIR=/apk

# O volume /data precisa ser do usuário node (uid 1000) no servidor: chown 1000:1000.
USER node
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "src/main.ts"]
