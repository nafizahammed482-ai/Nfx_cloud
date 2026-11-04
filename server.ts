import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { fileRouter } from './backend/routes/fileRoutes.js';
import { config } from './backend/config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = config.port || 3000;

  // JSON and URL-encoded body parser
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS headers
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (_req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Mount backend API routes under /api
  app.use('/api', fileRouter);

  // Serve static assets from public/ if present
  app.use('/public', express.static(path.join(__dirname, 'public')));

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Mount Vite development server middlewares
    console.log('[NFX Cloud] Starting in development mode with Vite middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving from dist/
    console.log('[NFX Cloud] Starting in production mode serving dist/...');
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[NFX Cloud] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[NFX Cloud] Telegram Storage Channel: ${config.telegram.channelId}`);
    console.log(`[NFX Cloud] Firebase Project: ${config.firebase.projectId}`);
  });
}

startServer().catch((err) => {
  console.error('[NFX Cloud] Server startup failure:', err);
  process.exit(1);
});
