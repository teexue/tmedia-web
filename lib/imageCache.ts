/**
 * 图片缓存服务
 * 用于预加载和缓存图片，提供快速的图片切换体验
 */

import { useMemo } from "react";
import { MediaFile } from "./types";
import { createFileURL, revokeFileURL } from "./fileSystem";

interface CacheEntry {
  url: string;
  mediaFile: MediaFile;
  timestamp: number;
  image?: HTMLImageElement;
}

export class ImageCacheService {
  private cache = new Map<string, CacheEntry>();
  private maxCacheSize = 10; // 最大缓存图片数量
  private preloadRange = 2; // 预加载范围（前后各2张）

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
   * 清理过期缓存
   */
  private cleanupCache(): void {
    if (this.cache.size <= this.maxCacheSize) return;

    // 按时间戳排序，删除最旧的条目
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );

    const deleteCount = this.cache.size - this.maxCacheSize + 1;
    for (let i = 0; i < deleteCount; i++) {
      const [key, entry] = entries[i];
      revokeFileURL(entry.url);
      this.cache.delete(key);
    }
  }

  /**
   * 获取缓存的图片URL
   */
  async getCachedImageURL(mediaFile: MediaFile): Promise<string> {
    const key = this.getCacheKey(mediaFile);
    const cached = this.cache.get(key);

    if (cached) {
      // 更新访问时间
      cached.timestamp = Date.now();
      return cached.url;
    }

    // 如果未缓存，创建新的URL并缓存
    const url = await createFileURL(mediaFile.handle as FileSystemFileHandle);
    const entry: CacheEntry = {
      url,
      mediaFile,
      timestamp: Date.now(),
    };

    // 预加载图片
    try {
      entry.image = await this.preloadImage(url);
    } catch (error) {
      console.warn("预加载图片失败:", error);
    }

    this.cache.set(key, entry);
    this.cleanupCache();

    return url;
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

    const promises: Promise<string>[] = [];

    // 预加载前后几张图片
    for (let i = -this.preloadRange; i <= this.preloadRange; i++) {
      const index = currentImageIndex + i;
      if (
        index >= 0 &&
        index < imageFiles.length &&
        index !== currentImageIndex
      ) {
        promises.push(this.getCachedImageURL(imageFiles[index]));
      }
    }

    // 异步预加载，不等待完成
    Promise.all(promises).catch((error) => {
      console.warn("预加载周围图片失败:", error);
    });
  }

  /**
   * 检查图片是否已缓存
   */
  isCached(mediaFile: MediaFile): boolean {
    const key = this.getCacheKey(mediaFile);
    return this.cache.has(key);
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { size: number; maxSize: number; keys: string[] } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * 清理所有缓存
   */
  clearCache(): void {
    this.cache.forEach((entry) => {
      revokeFileURL(entry.url);
    });
    this.cache.clear();
  }

  /**
   * 设置缓存配置
   */
  configure(options: { maxCacheSize?: number; preloadRange?: number }): void {
    if (options.maxCacheSize !== undefined) {
      this.maxCacheSize = Math.max(1, options.maxCacheSize);
    }
    if (options.preloadRange !== undefined) {
      this.preloadRange = Math.max(0, options.preloadRange);
    }
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
    }),
    []
  );
}
