import { Router, Request, Response } from 'express';
import multer from 'multer';
import { telegramService } from '../services/telegramService.js';
import { firebaseBackendService, CloudFileRecord } from '../services/firebaseService.js';
import { config } from '../config/config.js';

export const fileRouter = Router();

// Configure multer for memory storage (files up to 50MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.telegram.maxUploadSizeBytes, // 50MB
    files: 10, // max 10 files per request
  },
});

/**
 * Helper to extract extension
 */
function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/**
 * GET /api/status - Check health and configuration of Telegram & Firebase
 */
fileRouter.get('/status', async (_req: Request, res: Response) => {
  const telegramConfigured = telegramService.isConfigured();
  let botInfo: any = null;
  let telegramError: string | null = null;

  if (telegramConfigured) {
    const meRes = await telegramService.getMe();
    if (meRes.ok) {
      botInfo = meRes.result;
    } else {
      telegramError = meRes.error || 'Failed to verify bot token with Telegram API';
    }
  }

  res.json({
    ok: true,
    telegram: {
      configured: telegramConfigured,
      botUsername: botInfo?.username || null,
      channelId: telegramService.getChannelId(),
      error: telegramError,
      uploadLimitBytes: config.telegram.maxUploadSizeBytes,
      uploadLimitMB: 50,
      downloadLimitBytes: config.telegram.maxDownloadSizeBytes,
      downloadLimitMB: 20,
    },
    firebase: {
      ready: firebaseBackendService.isReady(),
      projectId: config.firebase.projectId,
      databaseURL: config.firebase.databaseURL,
    },
  });
});

/**
 * GET /api/files - List files from Firestore
 */
fileRouter.get('/files', async (req: Request, res: Response) => {
  try {
    const categoryId = req.query.category as string | undefined;
    const folderId = req.query.folder as string | undefined;
    const limitCount = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    const files = await firebaseBackendService.listFiles({ categoryId, folderId, limitCount });
    res.json({ ok: true, files });
  } catch (err: any) {
    console.error('Error fetching files:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to list files' });
  }
});

/**
 * GET /api/files/:fileId - Get single file metadata
 */
fileRouter.get('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const file = await firebaseBackendService.getFile(fileId);
    if (!file) {
      return res.status(404).json({ ok: false, error: 'File not found' });
    }
    res.json({ ok: true, file });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || 'Failed to get file' });
  }
});

/**
 * POST /api/upload - Upload file(s) to Telegram and save metadata in Firestore
 */
fileRouter.post('/upload', upload.array('files'), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ ok: false, error: 'No files provided for upload.' });
    }

    if (!telegramService.isConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'Telegram Bot is not configured. Please set TELEGRAM_BOT_TOKEN in the environment or secrets panel.',
      });
    }

    const categoryId = (req.body.categoryId || 'docs').toString();
    const folderId = req.body.folderId ? req.body.folderId.toString() : '';
    const caption = req.body.caption ? req.body.caption.toString() : '';
    const clientTransferId = req.body.transferId ? req.body.transferId.toString() : null;

    const uploadedRecords: CloudFileRecord[] = [];
    const errors: Array<{ fileName: string; error: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const transferId = clientTransferId || `transfer_${Date.now()}_${i}`;

      try {
        // Check size limit: 50MB
        if (file.size > config.telegram.maxUploadSizeBytes) {
          throw new Error(`File size ${(file.size / 1024 / 1024).toFixed(1)} MB exceeds Telegram Bot API limit of 50 MB.`);
        }

        // Notify Realtime Database: starting upload to Telegram
        await firebaseBackendService.updateTransferStatus(transferId, {
          fileName: file.originalname,
          fileSize: file.size,
          status: 'uploading_to_telegram',
          progress: 50,
        });

        // Send to Telegram private channel
        const tgResult = await telegramService.uploadToChannel(
          file.buffer,
          file.originalname,
          file.mimetype || 'application/octet-stream',
          caption || `Uploaded to NFX Cloud: ${file.originalname}`
        );

        // Notify Realtime Database: saving metadata to Firestore
        await firebaseBackendService.updateTransferStatus(transferId, {
          fileName: file.originalname,
          fileSize: file.size,
          status: 'saving_metadata',
          progress: 85,
        });

        const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const record: CloudFileRecord = {
          fileId,
          fileName: file.originalname,
          originalName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype || 'application/octet-stream',
          extension: getExtension(file.originalname),
          telegramMessageId: tgResult.messageId,
          telegramFileId: tgResult.fileId,
          telegramChatId: tgResult.chatId,
          folderId: folderId || undefined,
          categoryId: categoryId || 'docs',
          uploadedAt: Date.now(),
          updatedAt: Date.now(),
          status: 'uploaded',
        };

        // Save in Firestore
        await firebaseBackendService.saveFile(record);

        // Mark transfer as complete in Realtime Database
        await firebaseBackendService.updateTransferStatus(transferId, {
          fileName: file.originalname,
          fileSize: file.size,
          status: 'completed',
          progress: 100,
        });

        uploadedRecords.push(record);
      } catch (uploadErr: any) {
        console.error(`Upload error for file ${file.originalname}:`, uploadErr);
        await firebaseBackendService.updateTransferStatus(transferId, {
          fileName: file.originalname,
          fileSize: file.size,
          status: 'error',
          progress: 0,
          error: uploadErr.message || 'Upload failed',
        });
        errors.push({ fileName: file.originalname, error: uploadErr.message || 'Upload failed' });
      }
    }

    if (uploadedRecords.length === 0 && errors.length > 0) {
      return res.status(500).json({
        ok: false,
        error: errors[0].error,
        details: errors,
      });
    }

    res.json({
      ok: true,
      files: uploadedRecords,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error('Fatal upload handler error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Upload failed' });
  }
});

/**
 * GET /api/download/:fileId - Download file from Telegram and stream to client
 */
fileRouter.get('/download/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const file = await firebaseBackendService.getFile(fileId);

    if (!file) {
      return res.status(404).json({ ok: false, error: 'File record not found in database.' });
    }

    if (!telegramService.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Telegram Bot is not configured.' });
    }

    // Get file info from Telegram API
    const info = await telegramService.getFileInfo(file.telegramFileId);

    // Telegram Bot API limit: getFile only supports downloading files up to 20 MB
    if (info.fileSize > config.telegram.maxDownloadSizeBytes) {
      return res.status(400).json({
        ok: false,
        error: `Telegram hosted Bot API has a 20 MB download limit for getFile. This file is ${(info.fileSize / 1024 / 1024).toFixed(1)} MB.`,
        fileSize: info.fileSize,
        limitBytes: config.telegram.maxDownloadSizeBytes,
      });
    }

    const downloadUrl = telegramService.getDownloadUrl(info.filePath);
    const tgRes = await fetch(downloadUrl);

    if (!tgRes.ok || !tgRes.body) {
      throw new Error(`Failed to download file from Telegram server (HTTP ${tgRes.status})`);
    }

    const encodedFilename = encodeURIComponent(file.fileName);
    res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    if (info.fileSize) {
      res.setHeader('Content-Length', info.fileSize);
    }

    // Stream the binary response to the client
    const arrayBuffer = await tgRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error('Download error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Download failed' });
  }
});

/**
 * GET /api/stream/:fileId - Inline streaming for previews (images, audio, video, pdf)
 */
fileRouter.get('/stream/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const file = await firebaseBackendService.getFile(fileId);

    if (!file) {
      return res.status(404).json({ ok: false, error: 'File not found' });
    }

    if (!telegramService.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Telegram Bot is not configured' });
    }

    const info = await telegramService.getFileInfo(file.telegramFileId);

    if (info.fileSize > config.telegram.maxDownloadSizeBytes) {
      return res.status(400).json({
        ok: false,
        error: `File size exceeds Telegram 20 MB download limit for hosted Bot API.`,
      });
    }

    const downloadUrl = telegramService.getDownloadUrl(info.filePath);
    const tgRes = await fetch(downloadUrl);

    if (!tgRes.ok || !tgRes.body) {
      throw new Error(`Failed to stream file from Telegram (HTTP ${tgRes.status})`);
    }

    const encodedFilename = encodeURIComponent(file.fileName);
    res.setHeader('Content-Disposition', `inline; filename="${encodedFilename}"`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24 hours
    if (info.fileSize) {
      res.setHeader('Content-Length', info.fileSize);
    }

    const arrayBuffer = await tgRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error('Stream error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Stream failed' });
  }
});

/**
 * PATCH /api/files/:fileId - Rename or move file
 */
fileRouter.patch('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const { fileName, categoryId, folderId } = req.body;

    const file = await firebaseBackendService.getFile(fileId);
    if (!file) {
      return res.status(404).json({ ok: false, error: 'File not found in database' });
    }

    const updates: Partial<CloudFileRecord> = {};
    if (fileName && typeof fileName === 'string') {
      updates.fileName = fileName.trim();
      updates.extension = getExtension(fileName);
    }
    if (categoryId && typeof categoryId === 'string') {
      updates.categoryId = categoryId.trim();
    }
    if (folderId !== undefined) {
      updates.folderId = folderId ? folderId.toString() : '';
    }

    await firebaseBackendService.updateFile(fileId, updates);
    res.json({ ok: true, fileId, updates });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || 'Failed to update file' });
  }
});

/**
 * DELETE /api/files/:fileId - Delete file from Telegram and Firestore
 */
fileRouter.delete('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const file = await firebaseBackendService.getFile(fileId);

    if (!file) {
      return res.status(404).json({ ok: false, error: 'File not found in database' });
    }

    // Attempt to delete message from Telegram channel
    let telegramDeleted = false;
    if (file.telegramChatId && file.telegramMessageId) {
      telegramDeleted = await telegramService.deleteMessage(file.telegramChatId, file.telegramMessageId);
    }

    // Delete document from Firestore
    await firebaseBackendService.deleteFile(fileId);

    res.json({
      ok: true,
      fileId,
      telegramDeleted,
      message: 'File deleted successfully from Cloud and Telegram.',
    });
  } catch (err: any) {
    console.error('Delete error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to delete file' });
  }
});

/**
 * GET /api/transfers - List active/recent transfers
 */
fileRouter.get('/transfers', async (_req: Request, res: Response) => {
  try {
    const transfers = await firebaseBackendService.getTransfers();
    res.json({ ok: true, transfers });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || 'Failed to get transfers' });
  }
});
