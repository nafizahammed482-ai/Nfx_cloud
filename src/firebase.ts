import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import {
  getDatabase,
  ref,
  set,
  onValue,
  update,
  remove,
} from 'firebase/database';

export const firebaseConfig = {
  apiKey: "AIzaSyBi_A1vB4gv47Z5SapIoutDajQ7Oahy_LQ",
  authDomain: "nfx-cloud.firebaseapp.com",
  databaseURL: "https://nfx-cloud-default-rtdb.firebaseio.com",
  projectId: "nfx-cloud",
  storageBucket: "nfx-cloud.firebasestorage.app",
  messagingSenderId: "866014847082",
  appId: "1:866014847082:web:e5bbeb9bf6341173532a13"
};

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

export interface CloudFile {
  fileId: string;
  fileName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  extension: string;
  telegramMessageId: number;
  telegramFileId: string;
  telegramChatId: string;
  folderId?: string;
  categoryId: string;
  uploadedAt: number;
  updatedAt: number;
  status: 'uploaded' | 'deleting' | 'failed';
  downloadUrl?: string;
}

/**
 * Real-time listener for all files stored in Firestore
 */
export function subscribeCloudFiles(onUpdate: (files: CloudFile[]) => void, onError?: (err: any) => void) {
  try {
    const filesCol = collection(db, 'files');
    const q = query(filesCol, orderBy('uploadedAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const list: CloudFile[] = [];
        snapshot.forEach((d) => {
          list.push(d.data() as CloudFile);
        });
        onUpdate(list);
      },
      (err) => {
        console.warn('Real-time query fallback (no index):', err);
        // Fallback without orderBy in case indexing is pending
        return onSnapshot(collection(db, 'files'), (snapshot) => {
          const list: CloudFile[] = [];
          snapshot.forEach((d) => list.push(d.data() as CloudFile));
          list.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
          onUpdate(list);
        }, onError);
      }
    );
  } catch (err) {
    console.error('Failed to subscribe to cloud files:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Real-time listener for active file transfers in Realtime Database
 */
export function subscribeTransfers(onUpdate: (transfers: Record<string, any>) => void) {
  try {
    const transfersRef = ref(rtdb, 'transfers');
    return onValue(transfersRef, (snapshot) => {
      onUpdate(snapshot.exists() ? snapshot.val() : {});
    });
  } catch (err) {
    console.error('Failed to subscribe to transfers:', err);
    return () => {};
  }
}

/**
 * Set transfer progress in Realtime Database
 */
export async function setTransferProgress(transferId: string, data: {
  fileName: string;
  fileSize: number;
  status: string;
  progress: number;
  error?: string;
}) {
  try {
    const transferRef = ref(rtdb, `transfers/${transferId}`);
    await set(transferRef, {
      ...data,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.warn('Failed to update RTDB transfer:', err);
  }
}

/**
 * Remove transfer node when completed
 */
export async function clearTransfer(transferId: string) {
  try {
    const transferRef = ref(rtdb, `transfers/${transferId}`);
    await remove(transferRef);
  } catch (err) {
    // ignore
  }
}
