/**
 * URL池管理器 - 解决blob URL重复创建和过早释放的问题
 * 
 * 问题：
 * - 多次访问同一文件时，每次都创建新的blob URL
 * - URL被过早释放，导致后续访问失败
 * 
 * 解决方案：
 * - 使用引用计数管理URL生命周期
 * - 为相同文件重用已存在的URL
 * - 只有当没有引用时才释放URL
 */

import { MediaFile } from "./types";

interface URLPoolEntry {
  url: string;
  refCount: number;
  file: File;
  lastAccessed: number;
  mediaFile: MediaFile;
}

export class URLPoolManager {
  private pool = new Map<string, URLPoolEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly maxAge = 30 * 60 * 1000; // 30分钟无引用后清理
  
  constructor() {
    // 定期清理无引用的过期URL
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredURLs();
    }, 5 * 60 * 1000); // 每5分钟清理一次
  }

  /**
   * 生成文件的唯一键
   */
  private generateKey(mediaFile: MediaFile): string {
    return `${mediaFile.path}_${mediaFile.name}_${mediaFile.lastModified?.getTime() || 0}`;
  }

  /**
   * 获取或创建URL
   * @param mediaFile 媒体文件
   * @param file File对象
   * @returns URL和释放函数
   */
  async acquireURL(mediaFile: MediaFile, file: File): Promise<{
    url: string;
    release: () => void;
  }> {
    const key = this.generateKey(mediaFile);
    
    let entry = this.pool.get(key);
    
    if (entry) {
      // 重用现有URL
      entry.refCount++;
      entry.lastAccessed = Date.now();
      
      console.log(`🔄 重用URL (引用计数: ${entry.refCount}):`, mediaFile.name, entry.url);
      
      return {
        url: entry.url,
        release: () => this.releaseURL(key)
      };
    }
    
    // 创建新URL
    const url = URL.createObjectURL(file);
    entry = {
      url,
      refCount: 1,
      file,
      lastAccessed: Date.now(),
      mediaFile
    };
    
    this.pool.set(key, entry);
    
    console.log(`✨ 创建新URL (引用计数: 1):`, mediaFile.name, url);
    
    return {
      url,
      release: () => this.releaseURL(key)
    };
  }

  /**
   * 释放URL引用
   */
  private releaseURL(key: string): void {
    const entry = this.pool.get(key);
    if (!entry) {
      console.warn(`⚠️ 尝试释放不存在的URL: ${key}`);
      return;
    }
    
    entry.refCount--;
    entry.lastAccessed = Date.now();
    
    console.log(`🔻 释放URL引用 (剩余引用: ${entry.refCount}):`, entry.mediaFile.name, entry.url);
    
    // 如果没有引用了，立即或短延迟清理
    if (entry.refCount <= 0) {
      console.log(`⏰ 安排立即清理URL:`, entry.mediaFile.name);
      // 非常短的缓冲时间，主要是为了处理异步时序问题
      setTimeout(() => {
        const currentEntry = this.pool.get(key);
        if (currentEntry && currentEntry.refCount <= 0) {
          const timeSinceLastAccess = Date.now() - currentEntry.lastAccessed;
          if (timeSinceLastAccess > 100) { // 减少到100ms
            this.forceReleaseURL(key);
          } else {
            console.log(`🛡️ URL仍在短缓冲期，跳过清理:`, currentEntry.mediaFile.name);
          }
        } else {
          console.log(`🔄 URL已被重新引用，跳过清理:`, key);
        }
      }, 50); // 只给50ms的缓冲时间清理
    }
  }

  /**
   * 强制释放URL（立即清理）
   */
  private forceReleaseURL(key: string): void {
    const entry = this.pool.get(key);
    if (entry) {
      try {
        URL.revokeObjectURL(entry.url);
        console.log(`🗑️ 强制清理URL:`, entry.mediaFile.name, entry.url);
      } catch (error) {
        console.warn(`❌ 清理URL失败:`, error);
      }
      this.pool.delete(key);
    }
  }

  /**
   * 清理过期的URL
   */
  private cleanupExpiredURLs(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.pool.entries()) {
      // 如果没有引用且超过最大年龄，则清理
      if (entry.refCount <= 0 && (now - entry.lastAccessed) > this.maxAge) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => this.forceReleaseURL(key));
    
    if (expiredKeys.length > 0) {
      console.log(`清理了 ${expiredKeys.length} 个过期URL`);
    }
  }

  /**
   * 检查URL是否存在
   */
  hasURL(mediaFile: MediaFile): boolean {
    const key = this.generateKey(mediaFile);
    return this.pool.has(key);
  }

  /**
   * 获取当前池状态（用于调试）
   */
  getPoolStatus(): {
    total: number;
    active: number;
    inactive: number;
    entries: Array<{
      name: string;
      refCount: number;
      lastAccessed: Date;
    }>;
  } {
    const entries = Array.from(this.pool.values());
    const active = entries.filter(e => e.refCount > 0).length;
    
    return {
      total: entries.length,
      active,
      inactive: entries.length - active,
      entries: entries.map(e => ({
        name: e.mediaFile.name,
        refCount: e.refCount,
        lastAccessed: new Date(e.lastAccessed)
      }))
    };
  }

  /**
   * 清理所有URL（用于应用关闭时）
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // 清理所有URL
    for (const key of this.pool.keys()) {
      this.forceReleaseURL(key);
    }
    
    this.pool.clear();
    console.log('URL池已销毁');
  }
}

// 创建全局单例
export const urlPoolManager = new URLPoolManager();

// 确保在页面卸载时清理资源
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    urlPoolManager.destroy();
  });
}
