import { Capacitor } from '@capacitor/core';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
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
      bio: {
        isNative: boolean;
        isAvailable: () => Promise<boolean>;
        authenticate: (reason: string) => Promise<boolean>;
      };
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
  ready: true,
  bio: {
    isNative: Capacitor.isNativePlatform(),
    isAvailable: async () => {
      try {
        const r = await BiometricAuth.checkBiometry();
        return !!r.isAvailable;
      } catch {
        return false;
      }
    },
    authenticate: async (reason: string) => {
      try {
        await BiometricAuth.authenticate({
          reason,
          cancelTitle: 'Cancel',
          allowDeviceCredential: true,
          androidTitle: 'NFX Cloud',
          androidSubtitle: reason,
        });
        return true;
      } catch {
        return false;
      }
    },
  },
};

window.dispatchEvent(new CustomEvent('nfx-ready'));
