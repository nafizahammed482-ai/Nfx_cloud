import { 
  subscribeCloudFiles, 
  subscribeTransfers, 
  setTransferProgress, 
  clearTransfer, 
  CloudFile, 
  db, 
  rtdb 
} from './firebase.js';
import { 
  uploadFilesWithProgress, 
  downloadCloudFile, 
  deleteCloudFile, 
  renameCloudFile, 
  getBackendStatus,
  UploadProgressInfo,
  BackendStatus 
} from './api.js';

declare global {
  interface Window {
    NFX: {
      subscribeCloudFiles: typeof subscribeCloudFiles;
      subscribeTransfers: typeof subscribeTransfers;
      uploadFilesWithProgress: typeof uploadFilesWithProgress;
      downloadCloudFile: typeof downloadCloudFile;
      deleteCloudFile: typeof deleteCloudFile;
      renameCloudFile: typeof renameCloudFile;
      getBackendStatus: typeof getBackendStatus;
      db: typeof db;
      rtdb: typeof rtdb;
      ready: boolean;
    };
  }
}

window.NFX = {
  subscribeCloudFiles,
  subscribeTransfers,
  uploadFilesWithProgress,
  downloadCloudFile,
  deleteCloudFile,
  renameCloudFile,
  getBackendStatus,
  db,
  rtdb,
  ready: true
};

window.dispatchEvent(new CustomEvent('nfx-ready'));
