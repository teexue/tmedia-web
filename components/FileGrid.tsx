'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { FileSystemItem, MediaFile } from '@/lib/types';
import { getMediaTypeDisplayName, formatFileSize } from '@/lib/mediaTypes';
import { formatDate, cn } from '@/lib/utils';
import { createFileURL } from '@/lib/fileSystem';
import { 
  generateImageThumbnail, 
  generateVideoThumbnail, 
  thumbnailCache, 
  generateCacheKey 
} from '@/lib/thumbnail';
import { createLazyLoadObserver, PriorityQueue } from '@/lib/lazyLoad';
import { 
  Folder, 
  FileVideo, 
  FileAudio, 
  FileImage, 
  File,
  Calendar,
  HardDrive,
  Loader2
} from 'lucide-react';

interface FileGridProps {
  directories: FileSystemItem[];
  mediaFiles: MediaFile[];
  onDirectoryClick: (directory: FileSystemItem) => void;
  onMediaFileClick: (mediaFile: MediaFile) => void;
  className?: string;
}

interface ThumbnailState {
  [key: string]: {
    url: string | null;
    loading: boolean;
    error: boolean;
  };
}

export default function FileGrid({
  directories,
  mediaFiles,
  onDirectoryClick,
  onMediaFileClick,
  className
}: FileGridProps) {
  const [thumbnails, setThumbnails] = useState<ThumbnailState>({});
  const [visibleItems, setVisibleItems] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const thumbnailQueueRef = useRef<PriorityQueue<MediaFile>>(new PriorityQueue());
  const processingRef = useRef<boolean>(false);
  // 优化的缩略图生成（支持去重和优先级）
  const generateThumbnail = useCallback(async (mediaFile: MediaFile, priority = 1) => {
    const cacheKey = generateCacheKey(
      mediaFile.name, 
      mediaFile.lastModified?.getTime() || 0, 
      mediaFile.size || 0
    );

    // 设置加载状态
    setThumbnails(prev => ({
      ...prev,
      [cacheKey]: { url: null, loading: true, error: false }
    }));

    try {
      // 首先检查缓存
      const cachedUrl = await thumbnailCache.get(cacheKey);
      if (cachedUrl) {
        setThumbnails(prev => ({
          ...prev,
          [cacheKey]: { url: cachedUrl, loading: false, error: false }
        }));
        return cachedUrl;
      }

      // 生成新的缩略图
      const url = await createFileURL(mediaFile.handle as FileSystemFileHandle);
      const response = await fetch(url);
      const file = await response.blob();
      
      const thumbnailUrl = await thumbnailCache.generateAndCache(cacheKey, file as File, {
        fileName: mediaFile.name,
        filePath: mediaFile.path,
        fileSize: mediaFile.size || 0,
        lastModified: mediaFile.lastModified?.getTime() || 0,
        mediaType: mediaFile.mediaType
      });

      setThumbnails(prev => ({
        ...prev,
        [cacheKey]: { url: thumbnailUrl, loading: false, error: false }
      }));

      // 释放原始文件 URL
      URL.revokeObjectURL(url);
      
      return thumbnailUrl;
    } catch (error) {
      console.warn('生成缩略图失败:', error);
      setThumbnails(prev => ({
        ...prev,
        [cacheKey]: { url: null, loading: false, error: true }
      }));
      throw error;
    }
  }, []);

  // 处理缩略图队列
  const processThumbnailQueue = useCallback(async () => {
    if (processingRef.current || thumbnailQueueRef.current.isEmpty()) return;
    
    processingRef.current = true;
    
    try {
      // 一次处理3个缩略图，避免过多并发请求
      const promises: Promise<any>[] = [];
      for (let i = 0; i < 3 && !thumbnailQueueRef.current.isEmpty(); i++) {
        const mediaFile = thumbnailQueueRef.current.dequeue();
        if (mediaFile) {
          promises.push(generateThumbnail(mediaFile, 1));
        }
      }
      
      if (promises.length > 0) {
        await Promise.allSettled(promises);
        // 给浏览器一些时间处理其他任务
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } finally {
      processingRef.current = false;
      
      // 如果队列中还有项目，继续处理
      if (!thumbnailQueueRef.current.isEmpty()) {
        setTimeout(processThumbnailQueue, 100);
      }
    }
  }, [generateThumbnail]);

  // 懒加载观察器
  useEffect(() => {
    if (typeof window === 'undefined') return;

    observerRef.current = createLazyLoadObserver((entries) => {
      entries.forEach(entry => {
        const itemId = entry.target.getAttribute('data-item-id');
        if (!itemId) return;

        if (entry.isIntersecting) {
          setVisibleItems(prev => new Set([...prev, itemId]));
          
          // 找到对应的媒体文件并添加到队列
          const mediaFile = mediaFiles.find(file => {
            const cacheKey = generateCacheKey(
              file.name,
              file.lastModified?.getTime() || 0,
              file.size || 0
            );
            return cacheKey === itemId;
          });

          if (mediaFile && (mediaFile.mediaType === 'image' || mediaFile.mediaType === 'video')) {
            const cacheKey = generateCacheKey(
              mediaFile.name,
              mediaFile.lastModified?.getTime() || 0,
              mediaFile.size || 0
            );
            
            if (!thumbnails[cacheKey] && !thumbnailCache.get(cacheKey)) {
              // 图片优先级高于视频
              const priority = mediaFile.mediaType === 'image' ? 2 : 1;
              thumbnailQueueRef.current.enqueue(mediaFile, priority);
              processThumbnailQueue();
            }
          }
        } else {
          setVisibleItems(prev => {
            const newSet = new Set(prev);
            newSet.delete(itemId);
            return newSet;
          });
        }
      });
    }, {
      rootMargin: '100px' // 提前100px开始加载
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [mediaFiles, thumbnails, processThumbnailQueue]);

  const getMediaIcon = (mediaType: 'video' | 'audio' | 'image') => {
    switch (mediaType) {
      case 'video':
        return <FileVideo className="w-8 h-8 text-blue-500" />;
      case 'audio':
        return <FileAudio className="w-8 h-8 text-green-500" />;
      case 'image':
        return <FileImage className="w-8 h-8 text-purple-500" />;
      default:
        return <File className="w-8 h-8 text-gray-500" />;
    }
  };

  const renderMediaPreview = (mediaFile: MediaFile) => {
    const cacheKey = generateCacheKey(
      mediaFile.name, 
      mediaFile.lastModified?.getTime() || 0, 
      mediaFile.size || 0
    );
    
    const thumbnail = thumbnails[cacheKey];
    const isVisible = visibleItems.has(cacheKey);

    if (mediaFile.mediaType === 'audio') {
      return (
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
          <FileAudio className="w-8 h-8 text-green-600" />
        </div>
      );
    }

    // 只有在可见时才显示加载状态
    if (isVisible && thumbnail?.loading) {
      return (
        <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (thumbnail?.url) {
      return (
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted">
          <img
            src={thumbnail.url}
            alt={mediaFile.name}
            className="w-full h-full object-cover"
            loading="lazy" // 原生懒加载
            onError={() => {
              setThumbnails(prev => ({
                ...prev,
                [cacheKey]: { ...prev[cacheKey], error: true }
              }));
            }}
          />
        </div>
      );
    }

    // 回退到图标（显示文件类型）
    return (
      <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
        {getMediaIcon(mediaFile.mediaType)}
      </div>
    );
  };

  const allItems = [
    ...directories.map(dir => ({ ...dir, itemType: 'directory' as const })),
    ...mediaFiles.map(file => ({ ...file, itemType: 'media' as const }))
  ];

  if (allItems.length === 0) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center py-16 text-center",
        className
      )}>
        <Folder className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">此文件夹为空</h3>
        <p className="text-muted-foreground">
          此文件夹中没有找到任何媒体文件或子文件夹
        </p>
      </div>
    );
  }

  return (
    <div className={cn(
      "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4",
      className
    )}>
      {allItems.map((item) => {
        const cacheKey = item.itemType === 'media' 
          ? generateCacheKey(
              item.name,
              (item as MediaFile).lastModified?.getTime() || 0,
              (item as MediaFile).size || 0
            )
          : item.path;

        return (
          <div
            key={item.path}
            data-item-id={cacheKey}
            ref={(el) => {
              if (el && observerRef.current && item.itemType === 'media') {
                observerRef.current.observe(el);
              }
            }}
            onClick={() => {
              if (item.itemType === 'directory') {
                onDirectoryClick(item);
              } else {
                onMediaFileClick(item as MediaFile);
              }
            }}
            className={cn(
              "group cursor-pointer p-4 rounded-lg border border-border",
              "hover:border-primary hover:shadow-md transition-all duration-200",
              "bg-card hover:bg-accent/50"
            )}
          >
            <div className="flex flex-col items-center text-center space-y-3">
              {/* 图标/缩略图 */}
              <div className="flex-shrink-0 flex justify-center">
                {item.itemType === 'directory' ? (
                  <Folder className="w-16 h-16 text-blue-600" />
                ) : (
                  renderMediaPreview(item as MediaFile)
                )}
              </div>

            {/* 文件名 */}
            <div className="w-full">
              <h3 className="font-medium text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                {item.name}
              </h3>
            </div>

            {/* 详细信息 */}
            <div className="w-full text-xs text-muted-foreground space-y-1">
              {item.itemType === 'directory' ? (
                <div className="flex items-center justify-center gap-1">
                  <Folder className="w-3 h-3" />
                  <span>文件夹</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-1">
                    <span>{getMediaTypeDisplayName((item as MediaFile).mediaType)}</span>
                  </div>
                  {item.size && (
                    <div className="flex items-center justify-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      <span>{formatFileSize(item.size)}</span>
                    </div>
                  )}
                  {item.lastModified && (
                    <div className="flex items-center justify-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(item.lastModified)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
}