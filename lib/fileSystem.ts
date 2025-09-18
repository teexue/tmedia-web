import {
  FileSystemItem,
  MediaFile,
  DirectoryContent,
  FileSystemService,
} from "./types";
import { isMediaFile, getMediaType, getFileExtension } from "./mediaTypes";
import { buildPath, isFileSystemAccessSupported } from "./utils";

/**
 * 文件系统访问服务实现
 */
export class FileSystemAccessService implements FileSystemService {
  /**
   * 选择目录
   * @returns 目录句柄
   */
  async selectDirectory(): Promise<FileSystemDirectoryHandle> {
    if (!isFileSystemAccessSupported()) {
      throw new Error(
        "您的浏览器不支持文件系统访问功能，请使用 Chrome 86+ 或 Edge 86+ 浏览器"
      );
    }

    if (typeof window === "undefined") {
      throw new Error("文件系统访问功能只能在浏览器环境中使用");
    }

    try {
      const directoryHandle = await window.showDirectoryPicker({
        mode: "read",
      });
      return directoryHandle;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("用户取消了目录选择");
      }
      throw new Error("选择目录时发生错误：" + (error as Error).message);
    }
  }

  /**
   * 读取目录内容（优化版本，减少网络请求）
   * @param handle 目录句柄
   * @returns 目录内容
   */
  async readDirectory(
    handle: FileSystemDirectoryHandle
  ): Promise<DirectoryContent> {
    const directories: FileSystemItem[] = [];
    const mediaFiles: MediaFile[] = [];
    const currentPath = handle.name;

    try {
      // 批量收集文件信息，减少网络请求
      const filePromises: Promise<void>[] = [];
      const batchSize = 10; // 批量处理大小
      let currentBatch: Promise<void>[] = [];

      // 遍历目录中的所有项目
      for await (const [name, fileHandle] of handle.entries()) {
        if (fileHandle.kind === "directory") {
          // 目录不需要网络请求，直接添加
          directories.push({
            name,
            type: "directory",
            handle: fileHandle,
            path: buildPath(currentPath, name),
          });
        } else if (fileHandle.kind === "file" && this.isMediaFile(name)) {
          // 批量处理媒体文件
          const filePromise = this.processMediaFile(
            fileHandle as FileSystemFileHandle,
            name,
            currentPath
          )
            .then((mediaFile) => {
              if (mediaFile) {
                mediaFiles.push(mediaFile);
              }
            })
            .catch((error) => {
              console.warn(`无法处理文件 "${name}":`, error);
            });

          currentBatch.push(filePromise);

          // 当批次满了或者是最后一个文件时，处理当前批次
          if (currentBatch.length >= batchSize) {
            filePromises.push(...currentBatch);
            // 等待当前批次完成再继续，避免过多并发请求
            await Promise.all(currentBatch);
            currentBatch = [];
          }
        }
      }

      // 处理剩余的文件
      if (currentBatch.length > 0) {
        filePromises.push(...currentBatch);
        await Promise.all(currentBatch);
      }

      // 按名称排序
      directories.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
      mediaFiles.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

      return {
        directories,
        mediaFiles,
        currentPath,
      };
    } catch (error) {
      throw new Error("读取目录内容时发生错误：" + (error as Error).message);
    }
  }

  /**
   * 处理单个媒体文件（优化版本）
   * @param fileHandle 文件句柄
   * @param name 文件名
   * @param currentPath 当前路径
   * @returns 媒体文件信息或null
   */
  private async processMediaFile(
    fileHandle: FileSystemFileHandle,
    name: string,
    currentPath: string
  ): Promise<MediaFile | null> {
    try {
      const mediaType = this.getMediaType(name);
      if (!mediaType) return null;

      // 只获取文件基本信息，不立即读取文件内容
      const file = await fileHandle.getFile();

      return {
        name,
        type: "file",
        handle: fileHandle,
        path: buildPath(currentPath, name),
        size: file.size,
        lastModified: new Date(file.lastModified),
        mediaType,
        extension: getFileExtension(name),
      };
    } catch (error) {
      console.warn(`处理文件 "${name}" 时出错:`, error);
      return null;
    }
  }

  /**
   * 递归读取目录内容（扁平化展示）
   * @param handle 目录句柄
   * @param maxDepth 最大递归深度
   * @param currentDepth 当前深度
   * @returns 扁平化的目录内容
   */
  async readDirectoryFlat(
    handle: FileSystemDirectoryHandle,
    maxDepth = 3,
    currentDepth = 0
  ): Promise<DirectoryContent> {
    const directories: FileSystemItem[] = [];
    const mediaFiles: MediaFile[] = [];
    const currentPath = handle.name;

    try {
      // 处理当前目录
      const currentContent = await this.readDirectory(handle);
      directories.push(...currentContent.directories);
      mediaFiles.push(...currentContent.mediaFiles);

      // 如果还没达到最大深度，递归处理子目录
      if (currentDepth < maxDepth) {
        const subDirPromises = currentContent.directories.map(async (dir) => {
          try {
            const subContent = await this.readDirectoryFlat(
              dir.handle as FileSystemDirectoryHandle,
              maxDepth,
              currentDepth + 1
            );

            // 添加子目录的媒体文件，但不添加子目录本身（避免重复）
            mediaFiles.push(
              ...subContent.mediaFiles.map((file) => ({
                ...file,
                path: buildPath(dir.name, file.name), // 更新路径以显示层级
              }))
            );
          } catch (error) {
            console.warn(`无法读取子目录 "${dir.name}":`, error);
          }
        });

        await Promise.all(subDirPromises);
      }

      // 按路径和名称排序
      directories.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
      mediaFiles.sort((a, b) => {
        // 先按路径排序，再按文件名排序
        const pathCompare = a.path.localeCompare(b.path, "zh-CN");
        return pathCompare !== 0
          ? pathCompare
          : a.name.localeCompare(b.name, "zh-CN");
      });

      return {
        directories,
        mediaFiles,
        currentPath,
      };
    } catch (error) {
      throw new Error(
        "读取扁平化目录内容时发生错误：" + (error as Error).message
      );
    }
  }

  /**
   * 检查文件是否为媒体文件
   * @param fileName 文件名
   * @returns 是否为媒体文件
   */
  isMediaFile(fileName: string): boolean {
    return isMediaFile(fileName);
  }

  /**
   * 获取文件的媒体类型
   * @param fileName 文件名
   * @returns 媒体类型或null
   */
  getMediaType(fileName: string): "video" | "audio" | "image" | null {
    return getMediaType(fileName);
  }
}

// 创建单例实例
export const fileSystemService = new FileSystemAccessService();

/**
 * 验证文件句柄的读取权限，如果需要，会提示用户授权
 * @param fileHandle 要验证的文件句柄
 * @returns 如果权限被授予则返回 true，否则返回 false
 */
export async function verifyFileHandlePermission(
  fileHandle: FileSystemFileHandle
): Promise<boolean> {
  try {
    // 查询当前权限状态
    const permissionStatus = await fileHandle.queryPermission({ mode: "read" });

    if (permissionStatus === "granted") {
      return true; // 权限已授予
    }

    if (permissionStatus === "prompt") {
      // 权限需要用户确认，发起请求
      const newPermissionStatus = await fileHandle.requestPermission({
        mode: "read",
      });
      return newPermissionStatus === "granted"; // 如果用户同意，则返回 true
    }

    // 权限被拒绝
    return false;
  } catch (error) {
    console.error("验证文件权限时出错:", error);
    return false;
  }
}

/**
 * 创建文件的 URL 对象用于播放（简化版本）
 * @param fileHandle 文件句柄
 * @returns URL字符串
 */
export async function createFileURL(
  fileHandle: FileSystemFileHandle
): Promise<string> {
  try {
    // 在访问文件之前，验证并请求权限
    const hasPermission = await verifyFileHandlePermission(fileHandle);
    if (!hasPermission) {
      throw new Error(
        "文件访问权限已丢失或被拒绝。请重新选择文件夹以恢复访问。"
      );
    }

    const file = await fileHandle.getFile();
    return URL.createObjectURL(file);
  } catch (error) {
    if (error instanceof Error) {
      // 直接抛出自定义错误或验证失败的错误
      throw error;
    }
    // 包装其他未知错误
    throw new Error("创建文件 URL 时发生未知错误：" + (error as Error).message);
  }
}

/**
 * 释放文件 URL
 * @param url 要释放的 URL
 * @deprecated 直接使用 URL.revokeObjectURL(url) 代替
 */
export function revokeFileURL(url: string): void {
  console.warn('revokeFileURL is deprecated. Use URL.revokeObjectURL(url) instead.');
  URL.revokeObjectURL(url);
}
