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
  lastValidated?: number; // 最后验证时间
}

export class ImageCacheService {
  private cache = new Map<string, CacheEntry>();
  private maxCacheSize = 10; // 最大缓存图片数量
  private preloadRange = 2; // 预加载范围（前后各2张）
  private enableValidation = false; // 是否启用 blob URL 验证（临时关闭）

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
   * 检查 blob URL 是否仍然有效
   */
  private async isBlobURLValid(url: string): Promise<boolean> {
    if (!url.startsWith("blob:")) {
      return false;
    }

    try {
      // 使用 Image 对象来检测图片 blob URL 的有效性
      // 这比 fetch 更准确，且对图片专门优化
      return new Promise<boolean>((resolve) => {
        const img = new Image();
        const timeoutId = setTimeout(() => {
          resolve(false);
        }, 1000); // 1秒超时

        img.onload = () => {
          clearTimeout(timeoutId);
          resolve(true);
        };
        img.onerror = () => {
          clearTimeout(timeoutId);
          resolve(false);
        };

        img.src = url;
      });
    } catch {
      return false;
    }
  }

  /**
   * 获取缓存的图片URL
   */
  async getCachedImageURL(mediaFile: MediaFile): Promise<string> {
    const key = this.getCacheKey(mediaFile);
    const cached = this.cache.get(key);

    if (cached) {
      const now = Date.now();

      // 如果验证被禁用，直接返回缓存的 URL
      if (!this.enableValidation) {
        cached.timestamp = now;
        return cached.url;
      }

      const cacheAge = now - cached.timestamp;
      const lastValidated = cached.lastValidated || 0;
      const timeSinceValidation = now - lastValidated;

      // 智能验证策略：
      // 1. 如果缓存很新（5分钟内），直接使用
      // 2. 如果最近1分钟内已验证过，直接使用
      // 3. 否则进行验证
      if (cacheAge < 5 * 60 * 1000 || timeSinceValidation < 60 * 1000) {
        cached.timestamp = now;
        return cached.url;
      }

      // 需要验证 URL 有效性
      try {
        const isValid = await this.isBlobURLValid(cached.url);

        if (isValid) {
          // URL 有效，更新访问时间和验证时间
          cached.timestamp = now;
          cached.lastValidated = now;
          return cached.url;
        } else {
          // URL 无效，清理缓存并重新创建
          console.log("检测到无效的 blob URL，重新创建:", cached.url);
          try {
            revokeFileURL(cached.url);
          } catch (error) {
            console.warn("清理无效 URL 时出错:", error);
          }
          this.cache.delete(key);
        }
      } catch (error) {
        // 验证过程出错，也认为 URL 可能有问题，重新创建
        console.warn("验证 blob URL 时出错，重新创建:", error);
        try {
          revokeFileURL(cached.url);
        } catch (revokeError) {
          console.warn("清理 URL 时出错:", revokeError);
        }
        this.cache.delete(key);
      }
    }

    // 如果未缓存或缓存无效，创建新的URL并缓存
    try {
      const url = await createFileURL(mediaFile.handle as FileSystemFileHandle);
      const entry: CacheEntry = {
        url,
        mediaFile,
        timestamp: Date.now(),
        lastValidated: Date.now(),
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
    } catch (error) {
      console.error("创建文件 URL 失败:", error);
      throw new Error("无法加载图片文件");
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
      try {
        revokeFileURL(entry.url);
      } catch (error) {
        console.warn("清理缓存 URL 时出错:", error);
      }
    });
    this.cache.clear();
  }

  /**
   * 清理无效的缓存条目（温和模式，避免性能问题）
   */
  async cleanupInvalidCache(): Promise<void> {
    // 如果验证被禁用，不进行清理操作
    if (!this.enableValidation) {
      console.log("缓存验证已禁用，跳过清理操作");
      return;
    }

    const now = Date.now();
    const invalidKeys: string[] = [];

    // 只检查较老的缓存条目（超过10分钟）
    const oldEntries = Array.from(this.cache.entries()).filter(
      ([, entry]) => now - entry.timestamp > 10 * 60 * 1000
    );

    // 限制一次最多检查5个条目，避免性能问题
    const entriesToCheck = oldEntries.slice(0, 5);

    for (const [key, entry] of entriesToCheck) {
      try {
        const isValid = await this.isBlobURLValid(entry.url);
        if (!isValid) {
          invalidKeys.push(key);
          try {
            revokeFileURL(entry.url);
          } catch (error) {
            console.warn("清理无效缓存 URL 时出错:", error);
          }
        } else {
          // 如果 URL 仍然有效，更新验证时间
          entry.lastValidated = now;
        }
      } catch (error) {
        console.warn("验证缓存 URL 时出错:", error);
        // 验证出错的也认为是无效的
        invalidKeys.push(key);
        try {
          revokeFileURL(entry.url);
        } catch (revokeError) {
          console.warn("清理出错的缓存 URL 时出错:", revokeError);
        }
      }
    }

    invalidKeys.forEach((key) => this.cache.delete(key));

    if (invalidKeys.length > 0) {
      console.log(`清理了 ${invalidKeys.length} 个无效的缓存条目`);
    }
  }

  /**
   * 设置缓存配置
   */
  configure(options: {
    maxCacheSize?: number;
    preloadRange?: number;
    enableValidation?: boolean;
  }): void {
    if (options.maxCacheSize !== undefined) {
      this.maxCacheSize = Math.max(1, options.maxCacheSize);
    }
    if (options.preloadRange !== undefined) {
      this.preloadRange = Math.max(0, options.preloadRange);
    }
    if (options.enableValidation !== undefined) {
      this.enableValidation = options.enableValidation;
      console.log(`缓存验证已${options.enableValidation ? "启用" : "禁用"}`);
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
      cleanupInvalidCache:
        imageCacheService.cleanupInvalidCache.bind(imageCacheService),
    }),
    []
  );
}
