/**
 * 文件系统缓存管理
 * 管理 images 目录中的缩略图文件
 */

import { thumbnailDB, ThumbnailRecord } from './database';

class FileCacheManager {
  private readonly cacheDir = 'images';
  private dirHandle: FileSystemDirectoryHandle | null = null;

  /**
   * 初始化缓存目录
   */
  async init(): Promise<void> {
    try {
      // 检查是否支持 Origin Private File System API
      if ('storage' in navigator && navigator.storage && 'getDirectory' in navigator.storage) {
        // 获取当前目录的句柄
        const rootHandle = await navigator.storage.getDirectory();
        
        // 创建或获取 images 目录
        this.dirHandle = await rootHandle.getDirectoryHandle(this.cacheDir, { 
          create: true 
        });
      } else {
        throw new Error('不支持 Origin Private File System API');
      }
    } catch (error) {
      console.warn('无法初始化缓存目录，将使用内存缓存:', error);
      this.dirHandle = null;
    }
  }

  /**
   * 生成缓存文件名
   */
  private generateCacheFileName(id: string, extension: string = 'webp'): string {
    // 使用文件ID的哈希值作为文件名，避免路径问题
    const hash = this.simpleHash(id);
    return `thumb_${hash}.${extension}`;
  }

  /**
   * 简单哈希函数
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 保存缩略图到文件系统
   */
  async saveThumbnail(
    id: string, 
    blob: Blob, 
    metadata: Omit<ThumbnailRecord, 'thumbnailPath' | 'thumbnailSize' | 'createdAt'>
  ): Promise<string> {
    if (!this.dirHandle) {
      await this.init();
    }

    if (!this.dirHandle) {
      throw new Error('无法访问缓存目录');
    }

    const fileName = this.generateCacheFileName(id);
    
    try {
      // 创建文件
      const fileHandle = await this.dirHandle.getFileHandle(fileName, { 
        create: true 
      });
      
      // 写入数据
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      // 保存到数据库
      const record: ThumbnailRecord = {
        ...metadata,
        thumbnailPath: fileName,
        thumbnailSize: blob.size,
        createdAt: Date.now()
      };

      await thumbnailDB.saveThumbnail(record);

      return fileName;
    } catch (error) {
      throw new Error(`保存缩略图失败: ${error}`);
    }
  }

  /**
   * 从文件系统加载缩略图
   */
  async loadThumbnail(id: string): Promise<string | null> {
    try {
      // 从数据库获取记录
      const record = await thumbnailDB.getThumbnail(id);
      if (!record) {
        return null;
      }

      if (!this.dirHandle) {
        await this.init();
      }

      if (!this.dirHandle) {
        return null;
      }

      // 检查文件是否存在
      const fileHandle = await this.dirHandle.getFileHandle(record.thumbnailPath);
      const file = await fileHandle.getFile();
      
      // 创建 URL
      return URL.createObjectURL(file);
    } catch (error) {
      console.warn(`加载缩略图失败 (${id}):`, error);
      
      // 如果文件不存在，清理数据库记录
      try {
        await thumbnailDB.deleteThumbnail(id);
      } catch (dbError) {
        console.warn('清理数据库记录失败:', dbError);
      }
      
      return null;
    }
  }

  /**
   * 删除缓存文件
   */
  async deleteThumbnail(id: string): Promise<void> {
    try {
      const record = await thumbnailDB.getThumbnail(id);
      if (!record) return;

      if (!this.dirHandle) {
        await this.init();
      }

      if (this.dirHandle) {
        try {
          await this.dirHandle.removeEntry(record.thumbnailPath);
        } catch (error) {
          console.warn('删除缓存文件失败:', error);
        }
      }

      // 从数据库删除记录
      await thumbnailDB.deleteThumbnail(id);
    } catch (error) {
      console.warn(`删除缩略图失败 (${id}):`, error);
    }
  }

  /**
   * 清理过期文件
   */
  async cleanup(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      // 获取过期记录
      const expiredPaths = await thumbnailDB.cleanupOldThumbnails(maxAge);
      
      if (!this.dirHandle) {
        await this.init();
      }

      if (!this.dirHandle) return;

      // 删除过期文件
      for (const path of expiredPaths) {
        try {
          await this.dirHandle.removeEntry(path);
        } catch (error) {
          console.warn(`删除过期文件失败 (${path}):`, error);
        }
      }

      console.log(`清理了 ${expiredPaths.length} 个过期缩略图`);
    } catch (error) {
      console.warn('清理过期文件失败:', error);
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<{
    dbStats: any;
    diskUsage: number;
    fileCount: number;
  }> {
    const dbStats = await thumbnailDB.getStats();
    
    let diskUsage = 0;
    let fileCount = 0;

    if (this.dirHandle) {
      try {
        for await (const [name, handle] of this.dirHandle.entries()) {
          if (handle.kind === 'file' && name.startsWith('thumb_')) {
            const file = await (handle as FileSystemFileHandle).getFile();
            diskUsage += file.size;
            fileCount++;
          }
        }
      } catch (error) {
        console.warn('获取磁盘使用统计失败:', error);
      }
    }

    return {
      dbStats,
      diskUsage,
      fileCount
    };
  }

  /**
   * 检查缓存目录是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (!this.dirHandle) {
        await this.init();
      }
      return !!this.dirHandle;
    } catch (error) {
      return false;
    }
  }
}

// 单例实例
export const fileCacheManager = new FileCacheManager();