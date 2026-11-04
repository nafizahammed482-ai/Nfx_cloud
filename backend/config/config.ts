import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    channelId: (() => {
      const raw = (process.env.TELEGRAM_CHANNEL_ID || '-1004323473696').trim();
      if (raw.startsWith('-100')) return raw;
      if (raw.startsWith('100')) return '-' + raw;
      if (raw.startsWith('-')) return raw;
      return '-100' + raw;
    })(),
    maxUploadSizeBytes: 50 * 1024 * 1024, // 50 MB Telegram Bot API upload limit
    maxDownloadSizeBytes: 20 * 1024 * 1024, // 20 MB Telegram hosted Bot API getFile download limit
  },
  firebase: {
    apiKey: "AIzaSyBi_A1vB4gv47Z5SapIoutDajQ7Oahy_LQ",
    authDomain: "nfx-cloud.firebaseapp.com",
    databaseURL: "https://nfx-cloud-default-rtdb.firebaseio.com",
    projectId: "nfx-cloud",
    storageBucket: "nfx-cloud.firebasestorage.app",
    messagingSenderId: "866014847082",
    appId: "1:866014847082:web:e5bbeb9bf6341173532a13"
  }
};
