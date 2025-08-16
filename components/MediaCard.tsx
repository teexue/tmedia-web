'use client';

import { useState, useEffect, useRef } from 'react';
import { MediaFile } from '@/lib/types';
import { getMediaTypeDisplayName, formatFileSize } from '@/lib/mediaTypes';
import { formatDate, cn } from '@/lib/utils';
import { createFileURL } from '@/lib/fileSystem';
import { 
  generateImageThumbnail, 
  generateVideoThumbnail, 
  thumbnailCache, 
  generateCacheKey 
} from '@/lib/thumbnail';
import { 
  FileVideo, 
  FileAudio, 
  FileImage, 
  Play,
  Loader2,
  Clock,
  HardDrive
} from 'lucide-react';

interface MediaCardProps {
  mediaFile: MediaFile;
  onClick: (mediaFile: MediaFile) => void;
  showPath?: boolean;
  className?: string;
}

interface ThumbnailState {
  url: string | null;
  loading: boolean;
  error: boolean;
}

export default function MediaCard({ 
  mediaFile, 
  onClick, 
  showPath = false,
  className 
}: MediaCardProps) {
  const [thumbnail, setThumbnail] = useState<ThumbnailState>({
    url: null,
    loading: false,
    error: false
  });
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const cacheKey = generateCacheKey(
    mediaFile.name,
    mediaFile.lastModified?.getTime() || 0,
    mediaFile.size || 0
  );

  // 生成缩略图
  const generateThumbnail = async () => {
    setThumbnail({ url: null, loading: true, error: false });

    try {
      // 首先检查缓存
      const cachedUrl = await thumbnailCache.get(cacheKey);
      if (cachedUrl) {
        setThumbnail({ url: cachedUrl, loading: false, error: false });
        return;
      }

      // 生成新的缩略图
      const fileUrl = await createFileURL(mediaFile.handle as FileSystemFileHandle);
      const response = await fetch(fileUrl);
      const file = await response.blob();
      
      const thumbnailUrl = await thumbnailCache.generateAndCache(cacheKey, file as File, {
        fileName: mediaFile.name,
        filePath: mediaFile.path,
        fileSize: mediaFile.size || 0,
        lastModified: mediaFile.lastModified?.getTime() || 0,
        mediaType: mediaFile.mediaType
      });

      setThumbnail({ url: thumbnailUrl, loading: false, error: false });
      
      // 清理原始文件 URL
      URL.revokeObjectURL(fileUrl);
    } catch (error) {
      console.warn('生成缩略图失败:', error);
      setThumbnail({ url: null, loading: false, error: true });
    }
  };

  // 懒加载观察器
  useEffect(() => {
    if (!cardRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if ((mediaFile.mediaType === 'image' || mediaFile.mediaType === 'video') && 
                !thumbnail.url && !thumbnail.loading) {
              generateThumbnail();
            }
          }
        });
      },
      { rootMargin: '100px' }
    );

    observerRef.current.observe(cardRef.current);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [mediaFile.mediaType, thumbnail.url, thumbnail.loading]);

  const getMediaIcon = () => {
    switch (mediaFile.mediaType) {
      case 'video':
        return <FileVideo className="w-12 h-12 text-blue-500" />;
      case 'audio':
        return <FileAudio className="w-12 h-12 text-green-500" />;
      case 'image':
        return <FileImage className="w-12 h-12 text-purple-500" />;
    }
  };

  const renderThumbnail = () => {
    if (mediaFile.mediaType === 'audio') {
      return (
        <div className="w-full h-48 bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900/20 dark:to-green-800/20 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <FileAudio className="w-16 h-16 text-green-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-green-700 dark:text-green-300">音频文件</p>
          </div>
        </div>
      );
    }

    if (thumbnail.loading) {
      return (
        <div className="w-full h-48 bg-muted rounded-lg flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">生成预览中...</p>
          </div>
        </div>
      );
    }

    if (thumbnail.url) {
      return (
        <div className="relative w-full h-48 rounded-lg overflow-hidden bg-muted group">
          <img
            src={thumbnail.url}
            alt={mediaFile.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={() => {
              setThumbnail(prev => ({ ...prev, error: true }));
            }}
          />
          {mediaFile.mediaType === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="bg-white/90 dark:bg-black/90 rounded-full p-3">
                <Play className="w-6 h-6 text-black dark:text-white" />
              </div>
            </div>
          )}
        </div>
      );
    }

    // 回退到图标
    return (
      <div className="w-full h-48 bg-muted rounded-lg flex items-center justify-center">
        <div className="text-center">
          {getMediaIcon()}
          <p className="text-sm font-medium text-muted-foreground mt-2">
            {getMediaTypeDisplayName(mediaFile.mediaType)}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={cardRef}
      onClick={() => onClick(mediaFile)}
      className={cn(
        "group cursor-pointer bg-card rounded-xl border border-border overflow-hidden",
        "hover:border-primary hover:shadow-lg transition-all duration-300",
        "transform hover:-translate-y-1",
        className
      )}
    >
      {/* 缩略图区域 */}
      <div className="p-3">
        {renderThumbnail()}
      </div>

      {/* 信息区域 */}
      <div className="p-4 pt-0">
        {showPath && (
          <p className="text-xs text-muted-foreground mb-1 truncate">
            {mediaFile.path}
          </p>
        )}
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {mediaFile.lastModified && formatDate(mediaFile.lastModified)}
          </span>
          {mediaFile.size && (
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3" />
              {formatFileSize(mediaFile.size)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}