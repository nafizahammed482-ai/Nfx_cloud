import { config } from '../config/config.js';

export interface TelegramUploadResult {
  ok: boolean;
  messageId: number;
  fileId: string;
  fileUniqueId?: string;
  fileSize?: number;
  mimeType?: string;
  chatId: string;
}

export interface TelegramFileInfo {
  fileId: string;
  filePath: string;
  fileSize: number;
}

export class TelegramService {
  private botToken: string;
  private channelId: string;

  constructor() {
    this.botToken = config.telegram.botToken;
    this.channelId = config.telegram.channelId;
  }

  public isConfigured(): boolean {
    return Boolean(this.botToken && this.botToken.trim().length > 10);
  }

  public getChannelId(): string {
    return this.channelId;
  }

  /**
   * Verify Telegram Bot access
   */
  public async getMe(): Promise<{ ok: boolean; result?: any; error?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured.' };
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/getMe`);
      const data = await res.json() as any;
      return data;
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed to connect to Telegram API' };
    }
  }

  /**
   * Upload file to Telegram private channel using sendDocument
   */
  public async uploadToChannel(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    caption?: string
  ): Promise<TelegramUploadResult> {
    if (!this.isConfigured()) {
      throw new Error('TELEGRAM_BOT_TOKEN is missing. Please set TELEGRAM_BOT_TOKEN in the environment.');
    }

    if (fileBuffer.byteLength > config.telegram.maxUploadSizeBytes) {
      throw new Error(`File exceeds Telegram Bot API limit of 50 MB (size: ${(fileBuffer.byteLength / 1024 / 1024).toFixed(1)} MB).`);
    }

    const formData = new FormData();
    formData.append('chat_id', this.channelId);

    // Create standard Blob for FormData in Node.js
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType || 'application/octet-stream' });
    formData.append('document', blob, filename);

    if (caption) {
      formData.append('caption', caption.slice(0, 1024));
    }

    const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendDocument`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json() as any;

    if (!data.ok) {
      const desc = data.description || 'Unknown Telegram API error';
      throw new Error(`Telegram upload failed: ${desc}`);
    }

    const msg = data.result;
    const doc = msg.document || (msg.video) || (msg.audio) || (msg.photo ? msg.photo[msg.photo.length - 1] : null);

    if (!doc && !msg.document) {
      throw new Error('Telegram did not return a valid document or file ID');
    }

    const fileId = (doc && doc.file_id) || msg.message_id.toString();
    const fileUniqueId = doc && doc.file_unique_id;
    const fileSize = (doc && doc.file_size) || fileBuffer.byteLength;

    return {
      ok: true,
      messageId: msg.message_id,
      fileId,
      fileUniqueId,
      fileSize,
      mimeType: (doc && doc.mime_type) || mimeType,
      chatId: this.channelId,
    };
  }

  /**
   * Get file path from Telegram to prepare download
   */
  public async getFileInfo(fileId: string): Promise<TelegramFileInfo> {
    if (!this.isConfigured()) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
    }

    const res = await fetch(`https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`);
    const data = await res.json() as any;

    if (!data.ok) {
      throw new Error(`Failed to retrieve file from Telegram: ${data.description || 'Not found'}`);
    }

    const { file_path, file_size } = data.result;

    return {
      fileId,
      filePath: file_path,
      fileSize: file_size || 0,
    };
  }

  /**
   * Stream download url for a Telegram file path
   */
  public getDownloadUrl(filePath: string): string {
    return `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;
  }

  /**
   * Delete message containing the file from Telegram channel
   */
  public async deleteMessage(chatId: string, messageId: number): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId || this.channelId,
          message_id: messageId,
        }),
      });
      const data = await res.json() as any;
      return Boolean(data.ok);
    } catch (err) {
      console.error('Error deleting message from Telegram:', err);
      return false;
    }
  }
}

export const telegramService = new TelegramService();
