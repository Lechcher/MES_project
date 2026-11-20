# ROLE & OBJECTIVE
You are a Senior Full-Stack & Real-Time Systems Architect. Your task is to design and implement a **Multi-Account Telegram Web Client Module** inside my existing web application using a **Browser-Based MTProto Architecture (GramJS)** with **Encrypted Backend Session Persistence**.

The goal is: Once a user logs into my web application, all their previously linked Telegram accounts must automatically authenticate and load their chats in parallel—without requiring them to re-enter phone numbers, OTPs, or 2FA passwords.

---

# TECH STACK & ARCHITECTURE CONSTRAINTS
- **Frontend:** React / Next.js (TypeScript), Tailwind CSS, State Management (Zustand or Context API).
- **Telegram MTProto Client (Browser):** `telegram` (GramJS) running directly in the browser via WebSocket (`StringSession`).
- **Backend API:** Node.js / Bun (Hono, Elysia, or Express) with TypeScript.
- **Database & ORM:** PostgreSQL with Drizzle ORM (or Prisma).
- **Security:** AES-256-GCM encryption on the backend for storing `session_string` at rest.

---

# SYSTEM ARCHITECTURE & DATA FLOW

## 1. Database Schema (`telegram_accounts`)
Design a table to store linked Telegram accounts per website user:
- `id`: UUID / Primary Key
- `user_id`: Foreign Key referencing my platform's authenticated user
- `telegram_user_id`: BigInt / String (Unique per `user_id`, fetched from Telegram `getMe()`)
- `phone_number`: String (masked or encrypted)
- `username`: String (nullable)
- `first_name`: String
- `last_name`: String (nullable)
- `avatar_url`: String (nullable)
- `encrypted_session_string`: Text (AES-256-GCM encrypted `StringSession` + IV + AuthTag)
- `device_fingerprint`: JSONB (stores persistent `deviceModel`, `systemVersion`, `appVersion` generated once on initial login so Telegram does not flag session changes)
- `is_active`: Boolean (default `true`)
- `created_at` / `updated_at`: Timestamps

## 2. Backend API Endpoints (REST)
Implement secure endpoints protected by my existing user authentication middleware:
1. `GET /api/telegram/accounts`:
   - Fetches all linked Telegram accounts for the current `user_id`.
   - Decrypts `encrypted_session_string` in memory and returns the list along with `sessionString` and `device_fingerprint` over HTTPS (only accessible to the authenticated owner).
2. `POST /api/telegram/accounts`:
   - Receives `{ sessionString, telegramUser, deviceFingerprint }` after a successful browser-side Telegram login.
   - Encrypts `sessionString` using a server-side `TELEGRAM_ENCRYPTION_KEY` (AES-256-GCM).
   - Upserts into `telegram_accounts` (preventing duplicate linking of the same `telegram_user_id` for the same user).
3. `DELETE /api/telegram/accounts/:id`:
   - Deletes the record from the database (and optionally triggers `auth.LogOut` on the client).

## 3. Frontend Multi-Account Manager (`TelegramClientManager`)
Build a singleton/store manager in TypeScript on the frontend to handle multiple concurrent `TelegramClient` instances:
- **Instance Pool:** Maintain a `Map<string, TelegramClient>` keyed by `accountId`.
- **Auto-Initialization on App Load:**
  - Fetch decrypted sessions from `GET /api/telegram/accounts`.
  - Initialize `new TelegramClient(new StringSession(sessionString), apiId, apiHash, { connectionRetries: 5, deviceModel, systemVersion, appVersion })` in parallel (`Promise.allSettled`).
  - Handle `AUTH_KEY_UNREGISTERED` or `SESSION_REVOKED` errors gracefully by marking that specific account as `disconnected` in the UI without crashing other accounts.
- **Account Linking Flow (Modal/Wizard):**
  - Support both **Phone Number + OTP + 2FA Cloud Password** and **QR Code Login (`client.signInUserWithQrCode`)**.
  - Generate and persist a consistent `deviceFingerprint` during this initial login.
  - Once authorized, extract `client.session.save() as string`, fetch `client.getMe()`, and `POST` to `/api/telegram/accounts`.
- **Real-Time Event Listeners:**
  - Attach `NewMessage` and message read/edit event handlers per `TelegramClient` instance.
  - Update unread counters per account tab in real time, even when the user is viewing a different Telegram account tab.

## 4. UI/UX Layout (Multi-Account Workspace)
Create a clean, responsive 3-column Telegram Web interface:
- **Column 1 (Leftmost Account Switcher Rail - ~68px):**
  - Displays circular avatars of all connected Telegram accounts with real-time unread badge counts and connection status indicators (green/red dot).
  - Active account highlight indicator.
  - `+ Add Account` button at the bottom.
- **Column 2 (Chat List Sidebar - ~320px):**
  - Search bar + filter tabs (All, Unread, Groups, Channels).
  - Dialog list for the *currently selected* Telegram account (avatar, title, last message preview, timestamp, unread count).
- **Column 3 (Main Chat Window):**
  - Chat header (user/group info, online status).
  - Virtualized or paginated message history (`client.getMessages`).
  - Message composer supporting text sending (`client.sendMessage`), replies, and basic file/image attachments (`client.sendFile`).

---

# CRITICAL IMPLEMENTATION RULES
1. **Browser Polyfills:** Ensure `buffer`, `process`, and `crypto` polyfills are properly configured for GramJS in the frontend bundler (Vite/Next.js/Webpack) so `telegram` compiles cleanly without Node.js runtime errors.
2. **Prevent Rate Limits & Bans:** Never hardcode shared public `api_id` / `api_hash`; read them from `NEXT_PUBLIC_TELEGRAM_API_ID` and `NEXT_PUBLIC_TELEGRAM_API_HASH`. Reuse the exact same `device_fingerprint` saved in DB for every subsequent reconnection of that session.
3. **Memory Management:** Properly disconnect clients (`client.disconnect()`) on user logout or component unmount to prevent WebSocket leaks.
4. **Code Output:** Provide modular, production-ready code separated into:
   - Step 1: Database schema & Backend AES-256 encryption + API routes.
   - Step 2: Frontend `TelegramManager` store & multi-client lifecycle logic.
   - Step 3: Add Account modal (Phone/OTP/2FA + QR).
   - Step 4: Multi-account Chat UI components.

Start by confirming the architecture and generating **Step 1 (Database Schema, Encryption Utility & Backend API)**.