# HookFlow — Reliable Webhook Delivery & Event Processing System

**HookFlow** is an enterprise-grade, highly reliable asynchronous Webhook Delivery and Event Processing Engine built with Node.js, Express, MongoDB, Redis, BullMQ, and React. 

It solves the core challenges of modern webhook infrastructure: **non-blocking high-throughput event ingestion**, **asynchronous queuing**, **automatic retries with exponential backoff**, **HMAC-SHA256 payload signing**, **delivery status tracking**, and **at-least-once delivery idempotency**.

---

## 🎯 The Problem Solved

Webhook delivery systems face critical operational challenges:
1. **Blocking HTTP Endpoints**: Synchronously sending HTTP requests to third-party webhooks inside API handlers causes severe latency (>5-10s) and API timeouts.
2. **Network Failures & Unreliable Endpoints**: External receiver servers crash or experience intermittent 500 errors. Without automatic queuing and exponential retries, event notifications are permanently lost.
3. **Security & Data Tampering**: Unsigned webhooks leave receivers vulnerable to spoofed payload injection attacks.
4. **Duplicate Processing**: Network retries can cause receiver endpoints to process the same event multiple times without a stable idempotency key.

---

## 🏗️ Architecture Diagram

```
                     React Client
                           │
                           ▼  (POST /api/events - Non-Blocking <100ms)
                    Express REST API
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
         MongoDB                    BullMQ Queue (webhook-delivery)
             │                           │
     ┌───────┼────────┐                  ▼
     │       │        │                Redis
   User    Event   Delivery              │
                     │                   ▼
                     │            Worker Process (Consumer)
                     │                   │
                     │             HMAC-SHA256 Signing (crypto)
                     │             Header: X-HookFlow-Signature
                     │             Header: X-HookFlow-Delivery-ID
                     │                   │
                     └───────────────────▼
                                External Webhook
```

### Architectural Principles:
- **MongoDB**: Persistent source of truth storing durable application state (`User`, `Webhook`, `Event`, `Delivery`).
- **Redis + BullMQ**: Ephemeral distributed queue broker handling asynchronous delivery jobs (`{ deliveryId }`).
- **Background Worker**: Standalone process running independently from the Express REST API, pulling jobs, executing HTTP POST requests with a 5-second timeout, and tracking status.
- **HMAC-SHA256**: Generates constant-time verifiable signature over exact transmitted request body.
- **Delivery ID**: Functions as a stable idempotency key sent via `X-HookFlow-Delivery-ID` header across all retry attempts.

---

## 🚀 Tech Stack

- **Frontend**: React (v18), Vite, Tailwind CSS, Lucide Icons, React Router DOM
- **Backend API**: Node.js, Express.js (Modular Monolith)
- **Database**: MongoDB, Mongoose ODM
- **Queue & Broker**: Redis, BullMQ (`webhook-delivery` queue)
- **Background Processing**: Node.js Child Worker Process (`workers/webhookWorker.js`)
- **Security**: HMAC-SHA256 (`crypto`), JSON Web Tokens (`jsonwebtoken`), Password Hashing (`bcryptjs`), CORS
- **Environment**: `dotenv`

---

## 🔐 Security & Idempotency Features

### 1. Webhook Secret Isolation
- Webhook secrets are stored securely in MongoDB and excluded from standard JSON output (`toJSON` transform).
- Secrets are **never** rendered in frontend UIs, logged in server logs, or returned in GET `/api/webhooks` or GET `/api/deliveries`.

### 2. HMAC-SHA256 Webhook Signing
- The worker serializes the payload **ONCE** into a JSON string.
- Computes `HMAC-SHA256(payloadString, secret)` using Node's built-in `crypto`.
- Transmits signature in header: `X-HookFlow-Signature`.
- Verification utility (`server/utils/webhookSignature.js`) utilizes constant-time `crypto.timingSafeEqual` comparison to prevent timing attacks.

### 3. Delivery Idempotency & Semantics
- **At-Least-Once Delivery**: Guarantees delivery even in face of temporary network failures.
- **Stable Delivery ID Header**: `X-HookFlow-Delivery-ID: <deliveryId>` remains constant across all retry attempts, allowing receivers to safely deduplicate incoming webhooks.
- **Worker Concurrency & State Guard**: Prevents duplicate execution on already `SUCCESS` deliveries.

---

## 📡 API Endpoints Reference

### Authentication (Phase 1)
- `GET /api/health` — Public health check.
- `POST /api/auth/register` — User registration & JWT generation.
- `POST /api/auth/login` — Authentication & JWT generation.
- `GET /api/auth/me` — Protected profile lookup.

### Webhook Management (Phase 2)
- `POST /api/webhooks` — Register new webhook endpoint (requires `url`, `secret`).
- `GET /api/webhooks` — List user's webhooks (secrets omitted).
- `DELETE /api/webhooks/:id` — Delete webhook.

### Event & Delivery Ingestion (Phase 2 & 3)
- `POST /api/events` — Non-blocking event creation (<100ms response). Creates `PENDING` delivery records and enqueues BullMQ jobs.
- `GET /api/events` — List user's events.
- `GET /api/events/:id` — Get event details.
- `GET /api/deliveries` — List real-time delivery logs (`PENDING`, `PROCESSING`, `SUCCESS`, `FAILED`).
- `GET /api/deliveries/:id` — Get single delivery log.

### Test & Mock Webhook Destination Endpoints (Phase 3 & 4)
- `POST /api/test/webhook/success` — Echoes received headers (`X-HookFlow-Signature`, `X-HookFlow-Delivery-ID`) and returns 200 OK.
- `POST /api/test/webhook/fail` — Mock endpoint returning 500 error for retry testing.
- `POST /api/test/webhook/intermittent` — Fails twice with 500, succeeds on 3rd attempt.
- `POST /api/test/webhook/verify` — Validates HMAC signature using `verifySignature`.

---

## 💻 Local Setup & Execution Guide

### Prerequisites
- Node.js (v18+)
- MongoDB running on `mongodb://127.0.0.1:27017/hookflow`
- Redis running on `127.0.0.1:6379` (or run `npm run redis` in `server/`)

### Setup Instructions

1. **Clone & Install Dependencies**:
   ```bash
   # Install backend dependencies
   cd server
   npm install

   # Install frontend dependencies
   cd ../client
   npm install
   ```

2. **Configure Environment Variables**:
   Create `server/.env`:
   ```env
   PORT=5000
   CLIENT_URL=http://localhost:5173
   MONGO_URI=mongodb://127.0.0.1:27017/hookflow
   REDIS_URL=redis://127.0.0.1:6379
   JWT_SECRET=hookflow_super_secret_jwt_key_2026
   JWT_EXPIRES_IN=1d
   ```

3. **Start Applications (4 Separate Terminals)**:

   - **Terminal 1 (Redis Server)**:
     ```bash
     cd server
     npm run redis
     ```

   - **Terminal 2 (Express REST API Server)**:
     ```bash
     cd server
     npm run dev
     ```

   - **Terminal 3 (Background Webhook Worker)**:
     ```bash
     cd server
     npm run worker
     ```

   - **Terminal 4 (React Vite Frontend)**:
     ```bash
     cd client
     npm run dev
     ```

---

## 🧪 Automated Testing Suite

Run full phase test suites to verify end-to-end functionality:

```bash
# Execute Phase 1 Authentication Tests
node server/test_phase1.js

# Execute Phase 2 Webhooks & Events Tests
node server/test_phase2.js

# Execute Phase 3 Queue & Retry Integration Tests
node server/test_phase3.js

# Execute Phase 4 HMAC Security & Idempotency Tests (All 22 Assertions)
node server/test_phase4.js
```

