# 💬 ChitChat — Modern Realtime Workspace

A fast, sleek, real-time workspace chat application built with **Node.js, Express, Socket.io, and Modern Vanilla Web Technologies**. Features channel switching, direct replies, polls, emoji reactions, media sharing, user status badges, and authentication.

---

## 📁 Project Structure

```text
chit-chat/
├── frontend/
│   ├── index.html          # Application UI & HTML structure
│   ├── app.js              # Client-side Socket.IO & chat logic
│   ├── style.css           # Glassmorphism & dark theme styling
│   ├── logo.png            # App branding icon
│   ├── logo.jpg            # App branding banner/logo
│   └── package.json        # Frontend package configuration
│
├── backend/
│   ├── server.js           # Express + Socket.IO server engine
│   ├── models/
│   │   ├── User.js         # Mongoose User schema (auth & profile)
│   │   └── Message.js      # Mongoose Message schema (chat history)
│   ├── package.json        # Backend dependencies & start scripts
│   └── .env.example        # Environment variable template
│
├── .gitignore              # Git ignore rules
└── README.md               # Documentation & setup guide
```

---

## ✨ Features

- ⚡ **Realtime Messaging**: Instant communication powered by Socket.IO with typing indicators and unread badges.
- 🎨 **Glassmorphism Design**: High-end dark theme UI with custom fonts, smooth gradients, and micro-animations.
- 🟢 **Live Status Indicator**: Compact status dots with clean online/away/dnd labels.
- 📢 **Channels & Rooms**: Built-in channels (`#general`, `#lounge`, `#tech-talk`, etc.) plus custom channel creation.
- ↩️ **Message Replies & Reactions**: Thread context preview and interactive emoji reaction counters.
- 📊 **Interactive Polls**: Create and vote on polls live in any room.
- 🖼️ **Media Sharing & GIF Search**: Upload images and search GIFs directly in chat.
- 🔐 **Authentication & Profiles**: JWT-based authentication with bcrypt hashing and MongoDB persistence (with in-memory fallback).

---

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env     # (Optional) Customize environment variables
npm start
```

Backend will run on `http://localhost:3000`.

### 2. Frontend Setup

You can either:
- **Option A (Unified Server)**: Open `http://localhost:3000` in your browser. The backend automatically serves the `frontend/` files.
- **Option B (Dedicated Dev Server)**:
  ```bash
  cd frontend
  npm start
  ```

---

## ⚙️ Environment Variables

Configure these in `backend/.env`:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listening port |
| `JWT_SECRET` | `chitchat_super_secret_jwt_key_2026` | Secret key for signing JWT tokens |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/chitchat` | MongoDB connection connection URI |

> **Note**: If MongoDB is not running locally, the server automatically uses the built-in memory fallback for zero-configuration testing.
# GenX
