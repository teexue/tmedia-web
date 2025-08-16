'use client';

import { useState, useEffect } from 'react';
import { Folder, AlertCircle, HardDrive } from 'lucide-react';
import { fileSystemService } from '@/lib/fileSystem';
import { isFileSystemAccessSupported } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface DirectorySelectorProps {
  onDirectorySelected: (directoryHandle: FileSystemDirectoryHandle) => void;
  className?: string;
}

export default function DirectorySelector({
  onDirectorySelected,
  className
}: DirectorySelectorProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [mounted, setMounted] = useState(false);

  // 在客户端挂载后检查支持情况
  useEffect(() => {
    setMounted(true);
    setIsSupported(isFileSystemAccessSupported());
  }, []);

  const handleSelectDirectory = async () => {
    if (isSupported === false) {
      setError('您的浏览器不支持文件系统访问功能，请使用 Chrome 86+ 或 Edge 86+ 浏览器');
      return;
    }

    setIsSelecting(true);
    setError(null);

    try {
      const directoryHandle = await fileSystemService.selectDirectory();
      onDirectorySelected(directoryHandle);
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('选择目录时发生未知错误');
      }
    } finally {
      setIsSelecting(false);
    }
  };

  // 在挂载前显示加载状态，避免水合错误
  if (!mounted) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center min-h-[400px] p-8 text-center",
        className
      )}>
        <HardDrive className="w-20 h-20 text-primary mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-2">多媒体播放器</h1>
        <p className="text-muted-foreground text-lg">
          正在检查浏览器兼容性...
        </p>
      </div>
    );
  }

  if (isSupported === false) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center min-h-[400px] p-8 text-center",
        className
      )}>
        <AlertCircle className="w-16 h-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">浏览器不支持</h2>
        <p className="text-muted-foreground mb-4 max-w-md">
          您的浏览器不支持文件系统访问功能。请使用以下浏览器之一：
        </p>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Chrome 86 或更高版本</li>
          <li>• Microsoft Edge 86 或更高版本</li>
        </ul>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex flex-col items-center justify-center min-h-[400px] p-8 text-center",
      className
    )}>
      <div className="mb-8">
        <HardDrive className="w-20 h-20 text-primary mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-2">多媒体播放器</h1>
        <p className="text-muted-foreground text-lg">
          选择一个包含媒体文件的文件夹开始浏览
        </p>
      </div>

      <button
        onClick={handleSelectDirectory}
        disabled={isSelecting || isSupported !== true}
        className={cn(
          "flex items-center gap-3 px-6 py-3 bg-primary text-primary-foreground rounded-lg",
          "hover:bg-primary/90 transition-colors font-medium text-lg",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        )}
      >
        <Folder className="w-6 h-6" />
        {isSelecting ? '正在选择...' : '选择文件夹'}
      </button>

      {error && (
        <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg max-w-md">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-destructive mb-1">选择失败</h3>
              <p className="text-sm text-destructive/80">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 text-sm text-muted-foreground max-w-md space-y-4">
        <div>
          <p className="mb-2">支持的媒体格式：</p>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <strong>视频：</strong>
              <br />MP4, AVI, MKV, MOV, WMV
            </div>
            <div>
              <strong>音频：</strong>
              <br />MP3, WAV, FLAC, AAC, OGG
            </div>
            <div>
              <strong>图片：</strong>
              <br />JPG, PNG, GIF, BMP, WebP
            </div>
          </div>
        </div>
        
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            <strong>性能提示：</strong> 对于远程挂载的目录，应用会自动优化加载速度，缩略图将按需懒加载。
          </p>
        </div>
      </div>
    </div>
  );
}