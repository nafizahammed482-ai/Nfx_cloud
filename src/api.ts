import { setTransferProgress, clearTransfer } from './firebase.js';

export interface BackendStatus {
  ok: boolean;
  telegram: {
    configured: boolean;
    botUsername: string | null;
    channelId: string;
    error: string | null;
    uploadLimitBytes: number;
    uploadLimitMB: number;
    downloadLimitBytes: number;
    downloadLimitMB: number;
  };
  firebase: {
    ready: boolean;
    projectId: string;
    databaseURL: string;
  };
}

export interface UploadProgressInfo {
  fileName: string;
  fileSize: number;
  loadedBytes: number;
  totalBytes: number;
  percentage: number;
  status: 'uploading_to_server' | 'uploading_to_telegram' | 'saving_metadata' | 'completed' | 'error';
  error?: string;
}

/**
 * Check backend and Telegram / Firebase status
 */
export async function getBackendStatus(): Promise<BackendStatus | null> {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return null;
    return (await res.json()) as BackendStatus;
  } catch (err) {
    console.warn('Backend status check failed:', err);
    return null;
  }
}

/**
 * Upload multiple files to Telegram channel via Node.js backend
 * Real-time progress is broadcasted to both the UI callback and Firebase Realtime Database
 */
export function uploadFilesWithProgress(
  files: File[],
  options: {
    categoryId: string;
    folderId?: string;
    caption?: string;
    onProgress?: (info: UploadProgressInfo) => void;
    onSuccess?: (results: any[]) => void;
    onError?: (err: Error) => void;
  }
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    if (!files || files.length === 0) {
      return resolve([]);
    }

    const formData = new FormData();
    const transferId = `tr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    formData.append('categoryId', options.categoryId || 'docs');
    if (options.folderId) formData.append('folderId', options.folderId);
    if (options.caption) formData.append('caption', options.caption);
    formData.append('transferId', transferId);

    let totalUploadSize = 0;
    for (const f of files) {
      if (f.size > 50 * 1024 * 1024) {
        const err = new Error(`File "${f.name}" is ${(f.size / 1024 / 1024).toFixed(1)} MB, which exceeds Telegram's 50 MB upload limit.`);
        if (options.onError) options.onError(err);
        return reject(err);
      }
      totalUploadSize += f.size;
      formData.append('files', f, f.name);
    }

    const primaryFileName = files.length === 1 ? files[0].name : `${files[0].name} +${files.length - 1} more`;

    // Notify RTDB
    setTransferProgress(transferId, {
      fileName: primaryFileName,
      fileSize: totalUploadSize,
      status: 'uploading_to_server',
      progress: 0,
    });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const pct = Math.min(95, Math.round((event.loaded / event.total) * 100));
        const info: UploadProgressInfo = {
          fileName: primaryFileName,
          fileSize: totalUploadSize,
          loadedBytes: event.loaded,
          totalBytes: event.total,
          percentage: pct,
          status: pct >= 90 ? 'uploading_to_telegram' : 'uploading_to_server',
        };

        if (options.onProgress) options.onProgress(info);

        // Periodically update RTDB
        setTransferProgress(transferId, {
          fileName: primaryFileName,
          fileSize: totalUploadSize,
          status: info.status,
          progress: pct,
        });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.ok) {
            setTransferProgress(transferId, {
              fileName: primaryFileName,
              fileSize: totalUploadSize,
              status: 'completed',
              progress: 100,
            });

            // Clear transfer after 4 seconds
            setTimeout(() => clearTransfer(transferId), 4000);

            if (options.onProgress) {
              options.onProgress({
                fileName: primaryFileName,
                fileSize: totalUploadSize,
                loadedBytes: totalUploadSize,
                totalBytes: totalUploadSize,
                percentage: 100,
                status: 'completed',
              });
            }

            if (options.onSuccess) options.onSuccess(res.files);
            resolve(res.files);
          } else {
            const err = new Error(res.error || 'Upload failed');
            setTransferProgress(transferId, {
              fileName: primaryFileName,
              fileSize: totalUploadSize,
              status: 'error',
              progress: 0,
              error: err.message,
            });
            if (options.onError) options.onError(err);
            reject(err);
          }
        } catch (e: any) {
          const err = new Error('Invalid response from server');
          if (options.onError) options.onError(err);
          reject(err);
        }
      } else {
        let msg = `Upload failed with HTTP ${xhr.status}`;
        try {
          const errData = JSON.parse(xhr.responseText);
          if (errData.error) msg = errData.error;
        } catch (_) {}
        const err = new Error(msg);
        setTransferProgress(transferId, {
          fileName: primaryFileName,
          fileSize: totalUploadSize,
          status: 'error',
          progress: 0,
          error: msg,
        });
        if (options.onError) options.onError(err);
        reject(err);
      }
    };

    xhr.onerror = () => {
      const err = new Error('Network connection error while uploading');
      setTransferProgress(transferId, {
        fileName: primaryFileName,
        fileSize: totalUploadSize,
        status: 'error',
        progress: 0,
        error: err.message,
      });
      if (options.onError) options.onError(err);
      reject(err);
    };

    xhr.send(formData);
  });
}

/**
 * Download file through backend
 */
export async function downloadCloudFile(
  fileId: string,
  fileName: string,
  fileSize: number,
  onNotify?: (msg: string) => void
): Promise<void> {
  // Hosted Bot API check
  if (fileSize > 20 * 1024 * 1024) {
    const msg = `Hosted Telegram Bot API has a 20 MB download limit. This file is ${(fileSize / 1024 / 1024).toFixed(1)} MB and cannot be downloaded directly via the hosted Bot API.`;
    if (onNotify) onNotify(msg);
    alert(msg);
    return;
  }

  if (onNotify) onNotify(`Downloading ${fileName}…`);

  try {
    const res = await fetch(`/api/download/${fileId}`);
    if (!res.ok) {
      let errMsg = `Download failed (${res.status})`;
      try {
        const data = await res.json();
        if (data.error) errMsg = data.error;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err: any) {
    console.error('Download error:', err);
    if (onNotify) onNotify(err.message || 'Download failed');
    alert(err.message || 'Failed to download file');
  }
}

/**
 * Delete file from Telegram and Firestore
 */
export async function deleteCloudFile(fileId: string): Promise<boolean> {
  const res = await fetch(`/api/files/${fileId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    let msg = 'Failed to delete file';
    try {
      const d = await res.json();
      if (d.error) msg = d.error;
    } catch (_) {}
    throw new Error(msg);
  }
  const data = await res.json();
  return Boolean(data.ok);
}

/**
 * Rename file in Firestore
 */
export async function renameCloudFile(fileId: string, newName: string): Promise<boolean> {
  const res = await fetch(`/api/files/${fileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: newName }),
  });
  if (!res.ok) {
    let msg = 'Failed to rename file';
    try {
      const d = await res.json();
      if (d.error) msg = d.error;
    } catch (_) {}
    throw new Error(msg);
  }
  const data = await res.json();
  return Boolean(data.ok);
}
