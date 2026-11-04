# NFX Cloud — Backend Deployment Guide

This backend is built with **Node.js**, **Express.js**, **Firebase modular SDK** (Firestore & Realtime Database), and the **Telegram Bot API**.

## Features

- **Upload Endpoint (`POST /api/upload`)**: Uploads files up to 50 MB to your private Telegram channel, records message ID and file ID, saves metadata to Firestore, and pushes real-time progress to Firebase Realtime Database.
- **Download Endpoint (`GET /api/download/:fileId`)**: Retrieves file info from Telegram, checks the 20 MB hosted Bot API limit, and streams the binary file back with original filename and mime type.
- **Preview Stream (`GET /api/stream/:fileId`)**: Streams photos/videos/audio/PDFs for inline viewer.
- **Delete Endpoint (`DELETE /api/files/:fileId`)**: Deletes file message from Telegram channel (`deleteMessage`) and removes metadata document from Firestore.
- **Rename Endpoint (`PATCH /api/files/:fileId`)**: Updates document metadata in Firestore.
- **Status Endpoint (`GET /api/status`)**: Checks bot configuration, channel ID, and Firebase connectivity.

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot token provided by [@BotFather](https://t.me/BotFather) | Required |
| `TELEGRAM_CHANNEL_ID` | Private channel ID (e.g. `-1004323473696`) | `-1004323473696` |
| `PORT` | Web server port | `3000` |

---

## Telegram Setup Instructions

1. **Create Bot**: Open Telegram, message `@BotFather`, run `/newbot`, and copy your bot token (`TELEGRAM_BOT_TOKEN`).
2. **Add Bot as Channel Admin**:
   - Open your private channel (`-1004323473696`).
   - Go to Channel Info -> Administrators -> Add Administrator -> Select your bot.
   - Give it "Post Messages" and "Delete Messages" permissions.

---

## Deployment Options

### Option 1: Railway / Render / Fly.io / Heroku

1. Connect your repository.
2. Set root directory to `backend/` or use root `server.ts`.
3. Set Environment Variables:
   - `TELEGRAM_BOT_TOKEN`: Your bot token
   - `TELEGRAM_CHANNEL_ID`: `-1004323473696`
4. Build command: `npm install && npm run build`
5. Start command: `npm start`

### Option 2: Linux VPS / Ubuntu with PM2

```bash
git clone <your-repo>
cd nfx-cloud
npm install
cp backend/.env.example .env
nano .env # Paste TELEGRAM_BOT_TOKEN
npm run build
pm2 start "npm start" --name "nfx-cloud"
```
