# TokyoTrip Hub 🗼

> Um PWA colaborativo de inteligência de viagem, construído para capturar, organizar e publicar experiências de viagem.

[![Docker](https://img.shields.io/badge/Docker-Compose-blue?logo=docker)](https://docker.com)
[![React](https://img.shields.io/badge/Frontend-React_18-61DAFB?logo=react)](https://react.dev)
[![Node.js](https://img.shields.io/badge/Backend-Node.js_18-339933?logo=nodedotjs)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL_16-4169E1?logo=postgresql)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Queue-Redis_7-DC382D?logo=redis)](https://redis.io)
[![PWA](https://img.shields.io/badge/PWA-Offline--First-5A0FC8?logo=pwa)](https://web.dev/progressive-web-apps/)

---

## ✨ O que faz

O TokyoTrip Hub é um **diário de viagem colaborativo sem fricção**, projetado para uso no mundo real durante viagens:

- 📸 **Capture primeiro, organize depois** — tire fotos, grave memos de voz, salve locais, escreva notas rápidas
- 👥 **Colaboração em tempo real** — 4 viajantes contribuindo simultaneamente para o mesmo feed de viagem
- 🧠 **Organização automática por IA** — Whisper transcreve áudio, GPT-4V extrai texto de fotos, auto-categoriza e etiqueta tudo
- 📡 **Offline-first** — funciona nos túneis do metrô de Tóquio; sincroniza quando o WiFi volta
- 📖 **Exporte para publicar** — gere e-books, guias em PDF ou posts de blog a partir dos dados estruturados da viagem _(Phase 3)_

Construído como um **projeto de portfólio de nível produção** com potencial claro de monetização como SaaS.

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│  DISPOSITIVOS MÓVEIS (iOS/Android PWA)                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │  Foto   │ │  Voz    │ │  Texto  │ │  Maps   │          │
│  │  + OCR  │ │+ Whisper│ │  Nota   │ │  Local  │          │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘          │
│       └─────────────┴───────────┴───────────┘              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  React PWA + IndexedDB (fila offline)               │   │
│  │  • Service Worker (Workbox)                         │   │
│  │  • APIs de Câmera / MediaRecorder / Geolocalização  │   │
│  │  • Compressão de imagem no cliente (WebP, max 1MB)   │   │
│  └──────────────────────┬──────────────────────────────┘   │
└─────────────────────────┼──────────────────────────────────┘
                          │ WiFi / 4G
┌─────────────────────────┼──────────────────────────────────┐
│  BACKEND (Node.js 18)   │                                  │
│  ┌─────────┐ ┌─────────┐│┌─────────┐ ┌─────────────────┐  │
│  │ Express │ │Socket.io│││  Bull   │ │  APIs OpenAI    │  │
│  │  REST   │ │(salas)  │││ Fila    │ │  • Whisper      │  │
│  │  API    │ │         │││(Redis)  │ │  • GPT-4V       │  │
│  └────┬────┘ └────┬────┘│└────┬────┘ └─────────────────┘  │
│       └─────────────┘    │     │                            │
│  ┌────────────────────┐  │  ┌────────────────────────────┐ │
│  │  PostgreSQL 16     │  │  │  Disco Local / S3 /         │ │
│  │  • Usuários, Viagens│  │  │    Cloudinary (mídia)      │ │
│  │  • Entradas, Reações│  │  │                            │ │
│  │  • Comentários      │  │  └────────────────────────────┘ │
│  └────────────────────┘  │                                  │
└──────────────────────────┴──────────────────────────────────┘
```

---

## 🚀 Início Rápido

### Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (ou Colima)
- [Node.js 18+](https://nodejs.org/) (para desenvolvimento local fora do Docker)
- Chave de API da OpenAI (opcional — há modo MOCK para desenvolvimento sem custos)

### 1. Clone e Execute

```bash
git clone https://github.com/SEU_USUARIO/tokyotrip-hub.git
cd tokyotrip-hub

# Inicie todos os serviços (PostgreSQL, Redis, Backend, Frontend)
docker compose up --build
```

### 2. Inicialize o Banco de Dados

```bash
# Em um segundo terminal:
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

### 3. Acesse

| Serviço             | URL                                 |
| ------------------- | ----------------------------------- |
| Frontend (PWA)      | http://localhost:5173               |
| Health da API       | http://localhost:3001/api/health    |
| Documentação da API | http://localhost:3001/api (Swagger) |

### 4. Teste no Celular

Descubra seu IP local:

```bash
ipconfig getifaddr en0  # macOS
# ou
hostname -I  # Linux
```

Acesse no celular: `http://SEU_IP:5173`

> **Nota:** O CORS do backend está pré-configurado para `localhost:5173` e `192.168.x.x:5173`. Adicione seu IP específico em `backend/src/index.js` se necessário.

---

## 📱 Instalação do PWA

### iOS (Safari)

1. Abra `http://SEU_IP:5173` no Safari
2. Toque em Compartilhar → "Adicionar à Tela de Início"
3. Inicie pela tela inicial (tela cheia, sem barra do navegador)

### Android (Chrome)

1. Abra a URL no Chrome
2. Toque no menu → "Adicionar à tela inicial" ou "Instalar aplicativo"
3. Inicie como app standalone

---

## 🧪 Desenvolvimento

### Local (sem Docker)

```bash
# Terminal 1 — Banco de Dados e Cache
docker compose up postgres redis

# Terminal 2 — Backend
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npx prisma generate
npm run dev

# Terminal 3 — Frontend
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Variáveis de Ambiente

Crie `backend/.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tokyotrip?schema=public"
REDIS_URL="redis://localhost:6379"
OPENAI_API_KEY=sk-...
MOCK_AI=true  # true = simula IA sem custos; false = usa OpenAI real
BASE_URL=http://backend:3001
PORT=3001
UPLOAD_DIR="./uploads"
```

Crie `frontend/.env`:

```env
VITE_API_URL=http://localhost:3001
```

---

## 📡 Endpoints da API

### Autenticação

| Método | Endpoint              | Descrição                             |
| ------ | --------------------- | ------------------------------------- |
| POST   | `/api/users/register` | Cria usuário, retorna token de sessão |
| GET    | `/api/users/me`       | Obtém usuário atual                   |

### Viagens

| Método | Endpoint                 | Descrição                               |
| ------ | ------------------------ | --------------------------------------- |
| POST   | `/api/trips`             | Cria viagem (retorna código de convite) |
| POST   | `/api/trips/:code/join`  | Entra na viagem pelo código             |
| GET    | `/api/trips/:id`         | Detalhes da viagem                      |
| GET    | `/api/trips/:id/feed`    | Feed paginado de entradas               |
| GET    | `/api/trips/:id/members` | Lista membros da viagem                 |

### Entradas

| Método | Endpoint                         | Descrição                           |
| ------ | -------------------------------- | ----------------------------------- |
| POST   | `/api/entries/trips/:id/entries` | Cria entrada (multipart para mídia) |
| DELETE | `/api/entries/:id`               | Deleta entrada                      |
| POST   | `/api/entries/:id/reactions`     | Alterna reação de emoji             |
| POST   | `/api/entries/:id/comments`      | Adiciona comentário                 |
| GET    | `/api/entries/:id/status`        | Status de processamento da IA       |

---

## 🗺️ Roadmap

### Phase 1 ✅ — Fundação

- [x] Stack Docker Compose (PostgreSQL, Redis, Node, React)
- [x] Schema Prisma com todas as tabelas + hooks da Phase 2
- [x] API REST com Express
- [x] Salas em tempo real com Socket.io
- [x] Shell PWA com Service Worker
- [x] Captura de fotos com compressão no cliente
- [x] Reações e comentários
- [x] Códigos de convite e entrada em viagens

### Phase 2 ✅ — Inteligência

- [x] Fila offline com IndexedDB e sync em background
- [x] Transcrição de áudio com OpenAI Whisper
- [x] OCR + auto-categorização com GPT-4 Vision
- [x] Captura de memos de voz (MediaRecorder)
- [x] Endpoint de status de processamento da IA
- [x] Modo MOCK_AI para desenvolvimento sem custos

### Phase 3 🔄 — Publicação

- [ ] Motor de exportação (Puppeteer → PDF/EPUB)
- [ ] Templates de e-book
- [ ] Visualização de mapa com todas as entradas
- [ ] Extração de custos de recibos

### Phase 4 🚀 — SaaS

- [ ] Contas de usuário (substituir sessões temporárias)
- [ ] Múltiplas viagens por usuário
- [ ] Tiers de assinatura (Freemium)
- [ ] Armazenamento Cloudinary/S3
- [ ] Publicação com domínio personalizado

---

## 🧠 Recursos de IA

### Processamento de Áudio (Whisper)

- Grava memos de voz durante a viagem
- Auto-transcreve para texto pesquisável
- Armazena áudio + transcrição

### Inteligência de Imagem (GPT-4V)

- **OCR**: Extrai texto de cardápios, placas, recibos
- **Categorização**: Auto-classifica em Comida, Passeios, Transporte, etc.
- **Etiquetagem**: Gera tags relevantes ("ramen", "shibuya", "barato")
- **Sentimento**: Detecta experiências positivas/neutras/negativas

> **Nota para desenvolvimento:** Ative `MOCK_AI=true` no `.env` para testar todo o fluxo de UI sem consumir créditos da OpenAI.

---

## 🛠️ Stack Tecnológico

| Camada             | Tecnologia                                          |
| ------------------ | --------------------------------------------------- |
| **Frontend**       | React 18, Vite, Workbox (PWA)                       |
| **Backend**        | Node.js 18, Express, Socket.io                      |
| **Banco de Dados** | PostgreSQL 16, Prisma ORM                           |
| **Cache/Fila**     | Redis 7, Bull                                       |
| **IA**             | OpenAI Whisper + GPT-4 Vision (com modo MOCK)       |
| **Mídia**          | Compressão no cliente, disco local (pronto para S3) |
| **Exportação**     | Puppeteer (Phase 3)                                 |

---

## 🤝 Contribuição

Este projeto foi construído como **peça de portfólio** e potencial **Micro-SaaS**. Contribuições são bem-vindas:

1. Faça um fork do repositório
2. Crie uma branch: `git checkout -b feature/coisa-incrivel`
3. Commit: `git commit -m 'Adiciona coisa incrivel'`
4. Push: `git push origin feature/coisa-incrivel`
5. Abra um Pull Request

---

## 📄 Licença

MIT License — veja [LICENSE](LICENSE) para detalhes.

---

## 🙋 Sobre a Autora

Construído por [Juliana Suedde](https://github.com/juhsuedde/) para uma viagem real a Tóquio com 3 amigos. O objetivo: capturar tudo sem esforço durante a viagem, depois publicar as melhores descobertas como um e-book para outros viajantes.

**Dúvidas?** Abra uma issue ou entre em contato no [Twitter/X](https://twitter.com/juhsuedde.

---

<p align="center">
  <sub>Construído com ❤️, ☕ e muita expectativa para Tóquio.</sub>
</p>
