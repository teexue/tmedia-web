/**
 * 本地化文件缓存服务
 * 使用 IndexedDB 存储文件的二进制数据，实现真正的本地缓存
 * 
 * 简化版本：直接返回字符串URL
 */

import { MediaFile } from "./types";

interface CacheEntry {
  key: string;
  mediaFile: MediaFile;
  fileData: ArrayBuffer;
  mimeType: string;
  timestamp: number;
  accessCount: number;
}

export class LocalCacheService {
  private dbName = "TMediaLocalCache";
  private storeName = "fileCache";
  private version = 1;
  private maxCacheSize = 100 * 1024 * 1024; // 100MB 最大缓存大小
  private maxItems = 100; // 最大缓存条目数

  private db: IDBDatabase | null = null;

  /**
   * 初始化数据库
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 删除旧的 store（如果存在）
        if (db.objectStoreNames.contains(this.storeName)) {
          db.deleteObjectStore(this.storeName);
        }

        // 创建新的 store
        const store = db.createObjectStore(this.storeName, { keyPath: "key" });
        store.createIndex("timestamp", "timestamp");
        store.createIndex("accessCount", "accessCount");
      };
    });
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(mediaFile: MediaFile): string {
    return `${mediaFile.path}_${mediaFile.name}_${
      mediaFile.lastModified?.getTime() || 0
    }_${mediaFile.size || 0}`;
  }

  /**
   * 获取文件的 MIME 类型
   */
  private getMimeType(fileName: string): string {
    const ext = fileName.toLowerCase().split(".").pop() || "";
    const mimeTypes: Record<string, string> = {
      // 图片
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      bmp: "image/bmp",
      // 视频
      mp4: "video/mp4",
      webm: "video/webm",
      ogv: "video/ogg",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      // 音频
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      flac: "audio/flac",
      m4a: "audio/mp4",
    };

    return mimeTypes[ext] || "application/octet-stream";
  }

  /**
   * 获取当前缓存大小
   */
  private async getCacheSize(): Promise<number> {
    const db = await this.initDB();
    const transaction = db.transaction([this.storeName], "readonly");
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = request.result as CacheEntry[];
        const totalSize = entries.reduce(
          (size, entry) => size + entry.fileData.byteLength,
          0
        );
        resolve(totalSize);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清理过期缓存
   */
  private async cleanupCache(): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction([this.storeName], "readwrite");
    const store = transaction.objectStore(this.storeName);

    // 获取所有条目
    const allRequest = store.getAll();
    allRequest.onsuccess = async () => {
      const entries = allRequest.result as CacheEntry[];

      // 检查缓存大小
      const currentSize = entries.reduce(
        (size, entry) => size + entry.fileData.byteLength,
        0
      );

      if (entries.length > this.maxItems || currentSize > this.maxCacheSize) {
        // 按访问次数和时间排序，删除最少使用的
        entries.sort((a, b) => {
          // 先按访问次数，再按时间
          if (a.accessCount !== b.accessCount) {
            return a.accessCount - b.accessCount;
          }
          return a.timestamp - b.timestamp;
        });

        // 计算需要删除的数量
        let deleteCount = Math.max(entries.length - this.maxItems, 0);

        // 如果缓存大小超限，删除更多
        if (currentSize > this.maxCacheSize) {
          let sizeToDelete = currentSize - this.maxCacheSize * 0.8; // 删除到80%
          for (let i = 0; i < entries.length && sizeToDelete > 0; i++) {
            sizeToDelete -= entries[i].fileData.byteLength;
            deleteCount = Math.max(deleteCount, i + 1);
          }
        }

        // 删除条目
        const deleteTransaction = db.transaction([this.storeName], "readwrite");
        const deleteStore = deleteTransaction.objectStore(this.storeName);

        for (let i = 0; i < deleteCount; i++) {
          deleteStore.delete(entries[i].key);
        }

        console.log(`清理了 ${deleteCount} 个本地缓存条目`);
      }
    };
  }

  /**
   * 从本地缓存获取文件 URL
   */
  async getCachedFileURL(mediaFile: MediaFile): Promise<{ url: string; release: () => void } | null> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const key = this.getCacheKey(mediaFile);

      return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = async () => {
          const entry = request.result as CacheEntry | undefined;

          if (entry) {
            // 更新访问统计
            entry.accessCount++;
            entry.timestamp = Date.now();
            store.put(entry);

            try {
              // 从二进制数据创建 File 对象
              const blob = new Blob([entry.fileData], { type: entry.mimeType });
              const file = new File([blob], entry.mediaFile.name, { type: entry.mimeType });
              
              // 直接创建URL
              const url = URL.createObjectURL(file);

              console.log("从本地缓存加载文件:", mediaFile.name);
              resolve({ url, release: () => URL.revokeObjectURL(url) });
            } catch (error) {
              console.warn("创建缓存URL失败:", error);
              resolve(null);
            }
          } else {
            resolve(null);
          }
        };
        request.onerror = () => resolve(null);
      });
    } catch (error) {
      console.warn("从本地缓存读取失败:", error);
      return null;
    }
  }

  /**
   * 将文件存储到本地缓存
   */
  async cacheFile(mediaFile: MediaFile, file: File): Promise<{ url: string; release: () => void }> {
    try {
      const db = await this.initDB();
      const key = this.getCacheKey(mediaFile);
      const mimeType = this.getMimeType(mediaFile.name);

      // 读取文件数据
      const arrayBuffer = await file.arrayBuffer();

      // 检查单个文件大小（限制为5MB）
      if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
        console.log("文件过大，不缓存:", mediaFile.name);
        // 直接创建URL，不缓存到IndexedDB
        const url = URL.createObjectURL(file);
        return { url, release: () => URL.revokeObjectURL(url) };
      }

      const entry: CacheEntry = {
        key,
        mediaFile,
        fileData: arrayBuffer,
        mimeType,
        timestamp: Date.now(),
        accessCount: 1,
      };

      // 存储到 IndexedDB
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      store.put(entry);

      // 异步清理缓存
      this.cleanupCache().catch(console.error);

      // 直接创建URL
      const url = URL.createObjectURL(file);

      console.log("文件已缓存到本地:", mediaFile.name);
      return { url, release: () => URL.revokeObjectURL(url) };
    } catch (error) {
      console.warn("缓存文件失败:", error);
      // 失败时直接创建URL
      const url = URL.createObjectURL(file);
      return { url, release: () => URL.revokeObjectURL(url) };
    }
  }

  /**
   * 检查文件是否已缓存
   */
  async isCached(mediaFile: MediaFile): Promise<boolean> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const key = this.getCacheKey(mediaFile);

      return new Promise((resolve) => {
        const request = store.count(key);
        request.onsuccess = () => resolve(request.result > 0);
        request.onerror = () => resolve(false);
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getCacheStats(): Promise<{
    size: number;
    count: number;
    maxSize: number;
    maxItems: number;
  }> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const entries = request.result as CacheEntry[];
          const size = entries.reduce(
            (total, entry) => total + entry.fileData.byteLength,
            0
          );

          resolve({
            size,
            count: entries.length,
            maxSize: this.maxCacheSize,
            maxItems: this.maxItems,
          });
        };
        request.onerror = () =>
          resolve({
            size: 0,
            count: 0,
            maxSize: this.maxCacheSize,
            maxItems: this.maxItems,
          });
      });
    } catch (error) {
      return {
        size: 0,
        count: 0,
        maxSize: this.maxCacheSize,
        maxItems: this.maxItems,
      };
    }
  }

  /**
   * 清理所有本地缓存
   */
  async clearCache(): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      console.log("本地缓存已清空");
    } catch (error) {
      console.warn("清空本地缓存失败:", error);
    }
  }

  /**
   * 配置缓存参数
   */
  configure(options: { maxCacheSize?: number; maxItems?: number }): void {
    if (options.maxCacheSize !== undefined) {
      this.maxCacheSize = options.maxCacheSize;
    }
    if (options.maxItems !== undefined) {
      this.maxItems = options.maxItems;
    }
    console.log("本地缓存配置已更新:", {
      maxCacheSize: this.maxCacheSize,
      maxItems: this.maxItems,
    });
  }
}

// 单例实例
export const localCacheService = new LocalCacheService();
