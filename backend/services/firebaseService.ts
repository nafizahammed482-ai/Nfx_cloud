import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import {
  getDatabase,
  ref,
  set,
  update,
  remove,
  get,
} from 'firebase/database';
import { config } from '../config/config.js';

export interface CloudFileRecord {
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

export interface CloudFolderRecord {
  id: string;
  name: string;
  category: string;
  createdAt: number;
  updatedAt: number;
}

export class FirebaseBackendService {
  private app: any;
  private db: any;
  private rtdb: any;
  private initialized = false;

  constructor() {
    this.init();
  }

  private init() {
    try {
      this.app = getApps().length > 0 ? getApp() : initializeApp(config.firebase);
      this.db = getFirestore(this.app);
      this.rtdb = getDatabase(this.app);
      this.initialized = true;
    } catch (err) {
      console.error('Failed to initialize Firebase in backend:', err);
    }
  }

  public isReady(): boolean {
    return this.initialized;
  }

  public getFirestoreInstance() {
    return this.db;
  }

  public getDatabaseInstance() {
    return this.rtdb;
  }

  // --- Firestore: Files ---

  public async saveFile(file: CloudFileRecord): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized');
    const docRef = doc(this.db, 'files', file.fileId);
    await setDoc(docRef, file);
  }

  public async getFile(fileId: string): Promise<CloudFileRecord | null> {
    if (!this.db) throw new Error('Firestore is not initialized');
    const docRef = doc(this.db, 'files', fileId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as CloudFileRecord;
  }

  public async updateFile(fileId: string, updates: Partial<CloudFileRecord>): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized');
    const docRef = doc(this.db, 'files', fileId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Date.now(),
    });
  }

  public async deleteFile(fileId: string): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized');
    const docRef = doc(this.db, 'files', fileId);
    await deleteDoc(docRef);
  }

  public async listFiles(filters?: { categoryId?: string; folderId?: string; limitCount?: number }): Promise<CloudFileRecord[]> {
    if (!this.db) return [];
    try {
      const filesCol = collection(this.db, 'files');
      let q = query(filesCol, orderBy('uploadedAt', 'desc'));

      if (filters?.categoryId) {
        q = query(filesCol, where('categoryId', '==', filters.categoryId), orderBy('uploadedAt', 'desc'));
      }
      if (filters?.limitCount) {
        q = query(q, limit(filters.limitCount));
      }

      const snap = await getDocs(q);
      const list: CloudFileRecord[] = [];
      snap.forEach((d) => {
        list.push(d.data() as CloudFileRecord);
      });
      return list;
    } catch (err) {
      console.warn('Fallback listFiles query without compound order:', err);
      // Fallback in case composite index is building or in test mode
      const snap = await getDocs(collection(this.db, 'files'));
      let list: CloudFileRecord[] = [];
      snap.forEach((d) => {
        const item = d.data() as CloudFileRecord;
        if (filters?.categoryId && item.categoryId !== filters.categoryId) return;
        if (filters?.folderId && item.folderId !== filters.folderId) return;
        list.push(item);
      });
      list.sort((a, b) => b.uploadedAt - a.uploadedAt);
      if (filters?.limitCount) {
        list = list.slice(0, filters.limitCount);
      }
      return list;
    }
  }

  // --- Realtime Database: Transfers ---

  public async updateTransferStatus(transferId: string, data: {
    fileName: string;
    fileSize: number;
    status: 'starting' | 'uploading_to_server' | 'uploading_to_telegram' | 'saving_metadata' | 'completed' | 'error';
    progress: number;
    error?: string;
    timestamp?: number;
  }): Promise<void> {
    if (!this.rtdb) return;
    try {
      const transferRef = ref(this.rtdb, `transfers/${transferId}`);
      await set(transferRef, {
        ...data,
        timestamp: data.timestamp || Date.now(),
      });
    } catch (err) {
      console.error('Error writing transfer progress to RTDB:', err);
    }
  }

  public async removeTransfer(transferId: string): Promise<void> {
    if (!this.rtdb) return;
    try {
      const transferRef = ref(this.rtdb, `transfers/${transferId}`);
      await remove(transferRef);
    } catch (err) {
      console.error('Error removing transfer from RTDB:', err);
    }
  }

  public async getTransfers(): Promise<Record<string, any>> {
    if (!this.rtdb) return {};
    try {
      const transferRef = ref(this.rtdb, 'transfers');
      const snap = await get(transferRef);
      return snap.exists() ? snap.val() : {};
    } catch (err) {
      return {};
    }
  }
}

export const firebaseBackendService = new FirebaseBackendService();
