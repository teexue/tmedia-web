/**
 * 缩略图数据库管理
 * 使用 IndexedDB 存储缩略图元数据和映射关系
 */

export interface ThumbnailRecord {
  id: string; // 文件的唯一标识（基于路径、大小、修改时间）
  fileName: string;
  filePath: string;
  fileSize: number;
  lastModified: number;
  mediaType: 'image' | 'video' | 'audio';
  thumbnailPath: string; // 缩略图在 images 目录中的相对路径
  thumbnailSize: number; // 缩略图文件大小
  createdAt: number; // 缩略图创建时间
  quality: number; // 缩略图质量
  width: number; // 缩略图宽度
  height: number; // 缩略图高度
}

class ThumbnailDatabase {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'ThumbnailCache';
  private readonly dbVersion = 1;
  private readonly storeName = 'thumbnails';

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error('无法打开数据库'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // 创建对象存储
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          
          // 创建索引
          store.createIndex('fileName', 'fileName', { unique: false });
          store.createIndex('filePath', 'filePath', { unique: false });
          store.createIndex('mediaType', 'mediaType', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  }

  /**
   * 获取缩略图记录
   */
  async getThumbnail(id: string): Promise<ThumbnailRecord | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error('获取缩略图记录失败'));
      };
    });
  }

  /**
   * 保存缩略图记录
   */
  async saveThumbnail(record: ThumbnailRecord): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(record);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('保存缩略图记录失败'));
      };
    });
  }

  /**
   * 删除缩略图记录
   */
  async deleteThumbnail(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('删除缩略图记录失败'));
      };
    });
  }

  /**
   * 获取所有缩略图记录
   */
  async getAllThumbnails(): Promise<ThumbnailRecord[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error('获取所有缩略图记录失败'));
      };
    });
  }

  /**
   * 按媒体类型获取缩略图记录
   */
  async getThumbnailsByType(mediaType: 'image' | 'video' | 'audio'): Promise<ThumbnailRecord[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('mediaType');
      const request = index.getAll(mediaType);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error('按类型获取缩略图记录失败'));
      };
    });
  }

  /**
   * 清理过期的缩略图记录
   * @param maxAge 最大保存时间（毫秒）
   */
  async cleanupOldThumbnails(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<string[]> {
    if (!this.db) await this.init();

    const cutoffTime = Date.now() - maxAge;
    const expiredRecords: string[] = [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('createdAt');
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const record = cursor.value as ThumbnailRecord;
          expiredRecords.push(record.thumbnailPath);
          cursor.delete();
          cursor.continue();
        } else {
          resolve(expiredRecords);
        }
      };

      request.onerror = () => {
        reject(new Error('清理过期缩略图失败'));
      };
    });
  }

  /**
   * 获取数据库统计信息
   */
  async getStats(): Promise<{
    totalRecords: number;
    totalSize: number;
    byType: Record<string, number>;
  }> {
    const records = await this.getAllThumbnails();
    const stats = {
      totalRecords: records.length,
      totalSize: records.reduce((sum, record) => sum + record.thumbnailSize, 0),
      byType: {} as Record<string, number>
    };

    records.forEach(record => {
      stats.byType[record.mediaType] = (stats.byType[record.mediaType] || 0) + 1;
    });

    return stats;
  }
}

// 单例实例
export const thumbnailDB = new ThumbnailDatabase();