import express from 'express';
import { fileRouter } from './routes/fileRoutes.js';
import { config } from './config/config.js';

const app = express();
const PORT = config.port || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (_req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use('/api', fileRouter);

app.get('/', (_req, res) => {
  res.json({
    name: 'NFX Cloud API',
    status: 'online',
    version: '1.0.0',
    telegramChannel: config.telegram.channelId,
    uploadLimit: '50 MB',
    downloadLimit: '20 MB (Telegram Bot API limit)',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[NFX Cloud Backend] Running standalone on http://0.0.0.0:${PORT}`);
});
