/**
 * 图片缓存服务
 * 用于预加载和缓存图片，提供快速的图片切换体验
 */

import { useMemo } from "react";
import { MediaFile } from "./types";
import { createFileURL } from "./fileSystem";
import { localCacheService } from "./localCache";

// 内存中的临时缓存，用于快速访问
interface MemoryCacheEntry {
  url: string;
  timestamp: number;
}

export class ImageCacheService {
  // 内存中的临时 URL 缓存，用于快速访问已创建的 blob URL
  private memoryCache = new Map<string, MemoryCacheEntry>();
  private preloadRange = 2; // 预加载范围（前后各2张）
  private memoryCacheTimeout = 30 * 60 * 1000; // 内存缓存30分钟过期

  /**
   * 生成缓存键
   */
  private getCacheKey(mediaFile: MediaFile): string {
    return `${mediaFile.path}_${mediaFile.name}_${
      mediaFile.lastModified?.getTime() || 0
    }`;
  }

  /**
   * 预加载图片
   */
  private async preloadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * 清理内存中过期的 URL 缓存
   */
  private cleanupMemoryCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now - entry.timestamp > this.memoryCacheTimeout) {
        expiredKeys.push(key);
        try {
          URL.revokeObjectURL(entry.url);
        } catch (error) {
          console.warn("清理内存缓存 URL 失败:", error);
        }
      }
    }

    expiredKeys.forEach((key) => this.memoryCache.delete(key));

    if (expiredKeys.length > 0) {
      console.log(`清理了 ${expiredKeys.length} 个内存缓存条目`);
    }
  }

  /**
   * 获取缓存的图片URL（简单返回字符串）
   */
  async getCachedImageURL(mediaFile: MediaFile): Promise<string> {
    const key = this.getCacheKey(mediaFile);

    try {
      // 1. 检查本地缓存（IndexedDB）
      const cachedResult = await localCacheService.getCachedFileURL(mediaFile);
      if (cachedResult) {
        console.log("从本地缓存加载文件:", mediaFile.name);
        return cachedResult.url; // 只返回URL字符串
      }

      // 2. 从文件系统加载并缓存
      console.log("从文件系统加载:", mediaFile.name);
      const file = await (mediaFile.handle as FileSystemFileHandle).getFile();

      // 使用本地缓存服务存储文件
      const urlInfo = await localCacheService.cacheFile(mediaFile, file);

      return urlInfo.url; // 只返回URL字符串
    } catch (error) {
      console.error("获取缓存图片失败:", error);

      // 失败时尝试直接创建 URL
      try {
        const file = await (mediaFile.handle as FileSystemFileHandle).getFile();
        const url = URL.createObjectURL(file);
        return url; // 返回URL字符串
      } catch (fallbackError) {
        console.error("创建备用 URL 也失败:", fallbackError);
        throw new Error("无法加载图片文件，请检查文件访问权限");
      }
    }
  }

  /**
   * 预缓存图片列表中当前图片周围的图片
   */
  async preloadSurroundingImages(
    mediaFiles: MediaFile[],
    currentIndex: number
  ): Promise<void> {
    const imageFiles = mediaFiles.filter((file) => file.mediaType === "image");
    const currentImageIndex = imageFiles.findIndex(
      (file) => file.path === mediaFiles[currentIndex]?.path
    );

    if (currentImageIndex === -1) return;

    // 异步预加载前后几张图片（不阻塞当前操作）
    setTimeout(async () => {
      const preloadPromises: Promise<void>[] = [];

      for (let i = -this.preloadRange; i <= this.preloadRange; i++) {
        const index = currentImageIndex + i;
        if (
          index >= 0 &&
          index < imageFiles.length &&
          index !== currentImageIndex
        ) {
          const imageFile = imageFiles[index];

          // 检查是否已经缓存，如果没有则预加载
          const isAlreadyCached = await localCacheService.isCached(imageFile);
          if (!isAlreadyCached) {
            const promise = this.getCachedImageURL(imageFile)
              .then((url) => {
                // 预加载完成，URL已经被存储在缓存中
                console.log("预加载完成:", imageFile.name);
              })
              .catch((error) => {
                console.warn(`预加载图片 ${imageFile.name} 失败:`, error);
              });
            preloadPromises.push(promise);
          }
        }
      }

      await Promise.allSettled(preloadPromises);
    }, 10); // 减少到10ms，几乎立即开始预加载
  }

  /**
   * 检查图片是否已缓存（检查本地缓存）
   */
  async isCached(mediaFile: MediaFile): Promise<boolean> {
    const key = this.getCacheKey(mediaFile);

    // 先检查内存缓存
    if (this.memoryCache.has(key)) {
      return true;
    }

    // 再检查本地缓存
    return await localCacheService.isCached(mediaFile);
  }

  /**
   * 获取缓存统计信息（本地缓存）
   */
  async getCacheStats(): Promise<{
    size: number;
    count: number;
    maxSize: number;
    memoryCount: number;
  }> {
    const localStats = await localCacheService.getCacheStats();

    return {
      size: localStats.size,
      count: localStats.count,
      maxSize: localStats.maxSize,
      memoryCount: this.memoryCache.size,
    };
  }

  /**
   * 清理所有缓存（包括内存和本地缓存）
   */
  async clearCache(): Promise<void> {
    // 清理内存缓存
    this.memoryCache.forEach((entry) => {
      try {
        URL.revokeObjectURL(entry.url);
      } catch (error) {
        console.warn("清理内存缓存 URL 时出错:", error);
      }
    });
    this.memoryCache.clear();

    // 清理本地缓存
    await localCacheService.clearCache();

    console.log("所有缓存已清理");
  }

  /**
   * 清理过期的内存缓存（简化版）
   */
  async cleanupInvalidCache(): Promise<void> {
    // 只清理内存中过期的缓存
    this.cleanupMemoryCache();
    console.log("内存缓存清理完成");
  }

  /**
   * 设置缓存配置
   */
  configure(options: {
    preloadRange?: number;
    memoryCacheTimeout?: number;
    localCacheOptions?: {
      maxCacheSize?: number;
      maxItems?: number;
    };
  }): void {
    if (options.preloadRange !== undefined) {
      this.preloadRange = Math.max(0, options.preloadRange);
    }
    if (options.memoryCacheTimeout !== undefined) {
      this.memoryCacheTimeout = Math.max(60000, options.memoryCacheTimeout); // 最少1分钟
    }
    if (options.localCacheOptions) {
      localCacheService.configure(options.localCacheOptions);
    }

    console.log("图片缓存配置已更新");
  }
}

// 单例实例
export const imageCacheService = new ImageCacheService();

/**
 * React Hook for image caching
 */
export function useImageCache() {
  return useMemo(
    () => ({
      getCachedImageURL:
        imageCacheService.getCachedImageURL.bind(imageCacheService),
      preloadSurroundingImages:
        imageCacheService.preloadSurroundingImages.bind(imageCacheService),
      isCached: imageCacheService.isCached.bind(imageCacheService),
      getCacheStats: imageCacheService.getCacheStats.bind(imageCacheService),
      clearCache: imageCacheService.clearCache.bind(imageCacheService),
      cleanupInvalidCache:
        imageCacheService.cleanupInvalidCache.bind(imageCacheService),
      configure: imageCacheService.configure.bind(imageCacheService),
      // 额外提供本地缓存服务的直接访问
      localCache: {
        getCacheStats: localCacheService.getCacheStats.bind(localCacheService),
        clearCache: localCacheService.clearCache.bind(localCacheService),
        configure: localCacheService.configure.bind(localCacheService),
      },
    }),
    []
  );
}
