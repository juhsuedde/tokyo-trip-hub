FROM node:18-slim

# Instala OpenSSL + Chromium para Puppeteer
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    chromium \
    fonts-noto \
    fonts-noto-cjk \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 3001

CMD ["npm", "run", "dev"]