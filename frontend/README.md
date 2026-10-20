# Nexora Frontend

React (JavaScript) + Vite client for the Nexora chat backend. Connects over **both HTTP and Socket.IO**.

## Features
- **Login / Sign up** (HTTP `/auth`)
- **Create conversation** (HTTP `POST /chat/conversation/create`)
- **Join conversation by ID** (HTTP `POST /chat/conversation/join/:id`)
- **Conversation list + message history** (HTTP `GET /chat/conversation`, `GET /chat/conversation/:id/messages`)
- **Send / delete message** (HTTP `POST /chat/message/send`, `DELETE /chat/message/delete`)
- **Realtime** via Socket.IO: `send_message` + `new_notification`, and `join_room`/`leave_room` to subscribe

## Prerequisites
The backend must be running on **http://localhost:3000**:
```bash
cd ../backend
npm install   # once
npm start     # node server.js  (requires MySQL + ../backend/.env)
```

## Run the frontend
```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```
`vite.config.js` proxies `/auth`, `/chat` and `/socket.io` to `:3000`, so the app uses relative, same-origin URLs — no CORS config needed in the browser.

## Build
```bash
npm run build   # static output in dist/
```

## How auth flows
1. `POST /auth/login` returns a JWT in `payload.token`.
2. The token is stored in `localStorage` (`nexora_token`) and sent as `Authorization: Bearer <token>` on every HTTP request.
3. The Socket.IO handshake passes the same token in `auth.token`; the backend verifies it and puts the socket into `user:<id>`.
4. Opening a conversation emits `join_room <id>` so the socket subscribes to `conversation:<id>`.

> Note: login only succeeds for **email-verified** accounts (the backend checks `isVerified`). Sign up sends a verification email.

## Structure
```
src/
  api.js                     # HTTP client + JWT helpers
  context/AuthContext.jsx     # login/signup/logout, user state
  hooks/useSocket.js          # Socket.IO connection (JWT-authenticated)
  pages/AuthPage.jsx          # login / signup screen
  pages/ChatPage.jsx          # sidebar + thread + composer, REST & socket wiring
  components/Sidebar.jsx      # conversation list, create/join buttons
  components/MessageList.jsx  # message bubbles, delete
  components/Composer.jsx     # message input
  styles.css
  App.jsx                    # routes + protected /chat
  main.jsx                   # React + AuthProvider + BrowserRouter
```
