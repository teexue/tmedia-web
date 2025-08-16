/**
 * 缩略图生成工具（集成文件缓存）
 */

import { fileCacheManager } from './fileCache';
import { thumbnailDB, ThumbnailRecord } from './database';

/**
 * 为图片文件生成缩略图（优化版本，使用 WebP 格式）
 * @param file 图片文件
 * @param maxSize 最大尺寸
 * @param quality 质量（0-1）
 * @returns 缩略图 Blob
 */
export async function generateImageThumbnail(file: File, maxSize = 300, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', {
      alpha: false, // 禁用透明度以提升性能
      willReadFrequently: false
    });

    if (!ctx) {
      reject(new Error('无法创建 Canvas 上下文'));
      return;
    }

    img.onload = () => {
      try {
        // 计算缩略图尺寸
        const { width, height } = calculateThumbnailSize(img.width, img.height, maxSize);

        canvas.width = width;
        canvas.height = height;

        // 优化绘制性能
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';

        // 绘制缩略图
        ctx.drawImage(img, 0, 0, width, height);

        // 优先使用 WebP 格式，回退到 JPEG
        const formats = ['image/webp', 'image/jpeg'];
        let formatIndex = 0;

        const tryFormat = () => {
          const format = formats[formatIndex];
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else if (formatIndex < formats.length - 1) {
              formatIndex++;
              tryFormat();
            } else {
              reject(new Error('生成缩略图失败'));
            }
          }, format, quality);
        };

        tryFormat();
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('图片加载失败'));

    // 设置跨域属性
    img.crossOrigin = 'anonymous';
    img.src = URL.createObjectURL(file);
  });
}

/**
 * 为视频文件生成缩略图（优化版本，使用 WebP 格式）
 * @param file 视频文件
 * @param maxSize 最大尺寸
 * @param seekTime 截取时间点（秒）
 * @param quality 质量（0-1）
 * @returns 缩略图 Blob
 */
export async function generateVideoThumbnail(file: File, maxSize = 300, seekTime = 1, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', {
      alpha: false,
      willReadFrequently: false
    });

    if (!ctx) {
      reject(new Error('无法创建 Canvas 上下文'));
      return;
    }

    // 设置超时
    const timeout = setTimeout(() => {
      reject(new Error('视频缩略图生成超时'));
    }, 10000);

    video.onloadedmetadata = () => {
      // 选择较早的时间点以加快加载
      const targetTime = Math.min(seekTime, video.duration * 0.1, 3);
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      try {
        clearTimeout(timeout);

        // 计算缩略图尺寸
        const { width, height } = calculateThumbnailSize(video.videoWidth, video.videoHeight, maxSize);

        canvas.width = width;
        canvas.height = height;

        // 优化绘制性能
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';

        // 绘制视频帧
        ctx.drawImage(video, 0, 0, width, height);

        // 优先使用 WebP 格式
        const formats = ['image/webp', 'image/jpeg'];
        let formatIndex = 0;

        const tryFormat = () => {
          const format = formats[formatIndex];
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else if (formatIndex < formats.length - 1) {
              formatIndex++;
              tryFormat();
            } else {
              reject(new Error('生成视频缩略图失败'));
            }
          }, format, quality);
        };

        tryFormat();
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('视频加载失败'));
    };

    // 设置视频属性以优化性能
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';
    video.src = URL.createObjectURL(file);
  });
}

/**
 * 计算缩略图尺寸
 * @param originalWidth 原始宽度
 * @param originalHeight 原始高度
 * @param maxSize 最大尺寸
 * @returns 缩略图尺寸
 */
function calculateThumbnailSize(originalWidth: number, originalHeight: number, maxSize: number) {
  let width = originalWidth;
  let height = originalHeight;

  if (width > height) {
    if (width > maxSize) {
      height = (height * maxSize) / width;
      width = maxSize;
    }
  } else {
    if (height > maxSize) {
      width = (width * maxSize) / height;
      height = maxSize;
    }
  }

  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * 集成缓存的缩略图管理器
 */
class PersistentThumbnailCache {
  private memoryCache = new Map<string, string>();
  private maxMemorySize = 50; // 内存缓存数量限制
  private pendingRequests = new Map<string, Promise<string>>(); // 防止重复请求

  /**
   * 获取缩略图 URL
   */
  async get(id: string): Promise<string | null> {
    // 1. 检查内存缓存
    const memoryUrl = this.memoryCache.get(id);
    if (memoryUrl) {
      return memoryUrl;
    }

    // 2. 检查文件缓存
    try {
      const fileUrl = await fileCacheManager.loadThumbnail(id);
      if (fileUrl) {
        this.setMemoryCache(id, fileUrl);
        return fileUrl;
      }
    } catch (error) {
      console.warn('从文件缓存加载失败:', error);
    }

    return null;
  }

  /**
   * 生成并缓存缩略图
   */
  async generateAndCache(
    id: string,
    file: File,
    metadata: {
      fileName: string;
      filePath: string;
      fileSize: number;
      lastModified: number;
      mediaType: 'image' | 'video' | 'audio';
    }
  ): Promise<string> {
    // 检查是否已有待处理的请求
    const pendingRequest = this.pendingRequests.get(id);
    if (pendingRequest) {
      return pendingRequest;
    }

    const generatePromise = this.doGenerateAndCache(id, file, metadata);
    this.pendingRequests.set(id, generatePromise);

    try {
      const url = await generatePromise;
      return url;
    } finally {
      this.pendingRequests.delete(id);
    }
  }

  /**
   * 实际生成和缓存逻辑
   */
  private async doGenerateAndCache(
    id: string,
    file: File,
    metadata: {
      fileName: string;
      filePath: string;
      fileSize: number;
      lastModified: number;
      mediaType: 'image' | 'video' | 'audio';
    }
  ): Promise<string> {
    let blob: Blob;

    // 生成缩略图
    if (metadata.mediaType === 'image') {
      blob = await generateImageThumbnail(file, 400, 0.8);
    } else if (metadata.mediaType === 'video') {
      blob = await generateVideoThumbnail(file, 400, 1, 0.8);
    } else {
      throw new Error('不支持的媒体类型');
    }

    // 获取尺寸信息
    const { width, height } = await this.getBlobDimensions(blob, metadata.mediaType);

    try {
      // 保存到文件缓存
      await fileCacheManager.saveThumbnail(id, blob, {
        id,
        fileName: metadata.fileName,
        filePath: metadata.filePath,
        fileSize: metadata.fileSize,
        lastModified: metadata.lastModified,
        mediaType: metadata.mediaType,
        quality: 0.8,
        width,
        height
      });

      // 创建 URL 并添加到内存缓存
      const url = URL.createObjectURL(blob);
      this.setMemoryCache(id, url);

      return url;
    } catch (error) {
      console.warn('保存到文件缓存失败，使用临时 URL:', error);
      // 如果文件缓存失败，至少返回临时 URL
      const url = URL.createObjectURL(blob);
      this.setMemoryCache(id, url);
      return url;
    }
  }

  /**
   * 获取 Blob 的尺寸信息
   */
  private async getBlobDimensions(blob: Blob, mediaType: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        resolve({ width: 400, height: 300 }); // 默认尺寸
      };
      img.src = URL.createObjectURL(blob);
    });
  }

  /**
   * 设置内存缓存
   */
  private setMemoryCache(key: string, url: string) {
    // 如果缓存已满，删除最旧的项
    if (this.memoryCache.size >= this.maxMemorySize) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        const oldUrl = this.memoryCache.get(firstKey);
        if (oldUrl) {
          URL.revokeObjectURL(oldUrl);
        }
        this.memoryCache.delete(firstKey);
      }
    }

    this.memoryCache.set(key, url);
  }

  /**
   * 清理内存缓存
   */
  clearMemoryCache() {
    for (const url of this.memoryCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.memoryCache.clear();
    this.pendingRequests.clear();
  }

  /**
   * 删除缓存项
   */
  async delete(id: string): Promise<void> {
    // 清理内存缓存
    const memoryUrl = this.memoryCache.get(id);
    if (memoryUrl) {
      URL.revokeObjectURL(memoryUrl);
      this.memoryCache.delete(id);
    }

    // 清理文件缓存
    await fileCacheManager.deleteThumbnail(id);
  }

  /**
   * 获取缓存统计
   */
  async getStats() {
    const fileStats = await fileCacheManager.getStats();
    return {
      memoryCache: this.memoryCache.size,
      pendingRequests: this.pendingRequests.size,
      ...fileStats
    };
  }
}

export const thumbnailCache = new PersistentThumbnailCache();

/**
 * 生成文件的缓存键
 * @param fileName 文件名
 * @param lastModified 最后修改时间
 * @param size 文件大小
 * @returns 缓存键
 */
export function generateCacheKey(fileName: string, lastModified: number, size: number): string {
  return `${fileName}_${lastModified}_${size}`;
}