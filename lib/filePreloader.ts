/**
 * 文件预加载器
 * 在用户选择文件夹时立即读取所有文件数据并存储到本地缓存
 * 彻底解决生产环境中 FileSystemFileHandle 失效的问题
 */

import { MediaFile, DirectoryContent } from "./types";
import { localCacheService } from "./localCache";

export interface PreloadProgress {
  loaded: number;
  total: number;
  currentFile: string;
  isComplete: boolean;
}

export class FilePreloader {
  private isPreloading = false;
  private abortController: AbortController | null = null;

  /**
   * 预加载目录中的所有媒体文件
   */
  async preloadDirectory(
    directoryContent: DirectoryContent,
    onProgress?: (progress: PreloadProgress) => void
  ): Promise<void> {
    if (this.isPreloading) {
      console.warn("预加载已在进行中，跳过重复请求");
      return;
    }

    this.isPreloading = true;
    this.abortController = new AbortController();

    const mediaFiles = directoryContent.mediaFiles;
    const total = mediaFiles.length;
    let loaded = 0;

    try {
      console.log(`开始预加载 ${total} 个媒体文件...`);

      // 分批处理文件，避免同时处理太多文件导致内存问题
      const batchSize = 5;
      for (let i = 0; i < mediaFiles.length; i += batchSize) {
        if (this.abortController.signal.aborted) {
          console.log("预加载被取消");
          return;
        }

        const batch = mediaFiles.slice(i, i + batchSize);

        // 并行处理当前批次的文件
        const batchPromises = batch.map(async (mediaFile) => {
          try {
            // 检查是否已经缓存
            const isAlreadyCached = await localCacheService.isCached(mediaFile);
            if (isAlreadyCached) {
              console.log("文件已缓存，跳过:", mediaFile.name);
              loaded++;
              onProgress?.({
                loaded,
                total,
                currentFile: mediaFile.name,
                isComplete: false,
              });
              return;
            }

            // 从文件句柄读取文件数据
            const file = await (
              mediaFile.handle as FileSystemFileHandle
            ).getFile();

            // 存储到本地缓存
            await localCacheService.cacheFile(mediaFile, file);

            loaded++;
            console.log(`预加载完成 (${loaded}/${total}): ${mediaFile.name}`);

            onProgress?.({
              loaded,
              total,
              currentFile: mediaFile.name,
              isComplete: false,
            });
          } catch (error) {
            console.warn(`预加载文件失败: ${mediaFile.name}`, error);
            loaded++; // 即使失败也要增加计数，避免进度卡住

            onProgress?.({
              loaded,
              total,
              currentFile: mediaFile.name,
              isComplete: false,
            });
          }
        });

        // 等待当前批次完成
        await Promise.allSettled(batchPromises);

        // 批次间短暂延迟，避免过度占用资源
        if (i + batchSize < mediaFiles.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      console.log("所有文件预加载完成");
      onProgress?.({
        loaded,
        total,
        currentFile: "",
        isComplete: true,
      });
    } catch (error) {
      console.error("预加载过程中发生错误:", error);
    } finally {
      this.isPreloading = false;
      this.abortController = null;
    }
  }

  /**
   * 取消预加载
   */
  cancelPreload(): void {
    if (this.abortController) {
      this.abortController.abort();
      console.log("预加载已取消");
    }
  }

  /**
   * 检查是否正在预加载
   */
  isPreloadingActive(): boolean {
    return this.isPreloading;
  }

  /**
   * 预加载特定的媒体文件列表（用于按需加载）
   */
  async preloadSpecificFiles(
    mediaFiles: MediaFile[],
    onProgress?: (progress: PreloadProgress) => void
  ): Promise<void> {
    const total = mediaFiles.length;
    let loaded = 0;

    for (const mediaFile of mediaFiles) {
      try {
        // 检查是否已经缓存
        const isAlreadyCached = await localCacheService.isCached(mediaFile);
        if (isAlreadyCached) {
          loaded++;
          onProgress?.({
            loaded,
            total,
            currentFile: mediaFile.name,
            isComplete: false,
          });
          continue;
        }

        // 从文件句柄读取文件数据
        const file = await (mediaFile.handle as FileSystemFileHandle).getFile();

        // 存储到本地缓存
        await localCacheService.cacheFile(mediaFile, file);

        loaded++;
        console.log(`按需加载完成: ${mediaFile.name}`);

        onProgress?.({
          loaded,
          total,
          currentFile: mediaFile.name,
          isComplete: loaded === total,
        });
      } catch (error) {
        console.warn(`按需加载文件失败: ${mediaFile.name}`, error);
        loaded++;

        onProgress?.({
          loaded,
          total,
          currentFile: mediaFile.name,
          isComplete: loaded === total,
        });
      }
    }
  }
}

// 单例实例
export const filePreloader = new FilePreloader();
