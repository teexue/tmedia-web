'use client';

import { useState, useEffect } from 'react';
import { thumbnailCache } from '@/lib/thumbnail';
import { fileCacheManager } from '@/lib/fileCache';
import { formatFileSize } from '@/lib/mediaTypes';
import { cn } from '@/lib/utils';
import { 
  Database, 
  HardDrive, 
  Trash2, 
  RefreshCw, 
  Info,
  X
} from 'lucide-react';

interface CacheStats {
  memoryCache: number;
  pendingRequests: number;
  dbStats: {
    totalRecords: number;
    totalSize: number;
    byType: Record<string, number>;
  };
  diskUsage: number;
  fileCount: number;
}

interface CacheManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CacheManager({ isOpen, onClose }: CacheManagerProps) {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  // 加载缓存统计
  const loadStats = async () => {
    setLoading(true);
    try {
      const cacheStats = await thumbnailCache.getStats();
      setStats(cacheStats as CacheStats);
    } catch (error) {
      console.error('加载缓存统计失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 清理缓存
  const cleanupCache = async () => {
    setCleaning(true);
    try {
      // 清理过期文件（30天）
      await fileCacheManager.cleanup(30 * 24 * 60 * 60 * 1000);
      
      // 清理内存缓存
      thumbnailCache.clearMemoryCache();
      
      // 重新加载统计
      await loadStats();
    } catch (error) {
      console.error('清理缓存失败:', error);
    } finally {
      setCleaning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStats();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">缓存管理</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-primary mr-2" />
              <span>加载统计信息...</span>
            </div>
          ) : stats ? (
            <>
              {/* 总览 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-muted/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-primary">
                    {stats.dbStats.totalRecords}
                  </div>
                  <div className="text-sm text-muted-foreground">缓存记录</div>
                </div>
                
                <div className="bg-muted/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {formatFileSize(stats.diskUsage)}
                  </div>
                  <div className="text-sm text-muted-foreground">磁盘使用</div>
                </div>
                
                <div className="bg-muted/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {stats.memoryCache}
                  </div>
                  <div className="text-sm text-muted-foreground">内存缓存</div>
                </div>
                
                <div className="bg-muted/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {stats.fileCount}
                  </div>
                  <div className="text-sm text-muted-foreground">缓存文件</div>
                </div>
              </div>

              {/* 按类型统计 */}
              <div className="space-y-3">
                <h3 className="font-medium flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  按类型统计
                </h3>
                <div className="space-y-2">
                  {Object.entries(stats.dbStats.byType).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                      <span className="capitalize">
                        {type === 'image' ? '图片' : type === 'video' ? '视频' : '音频'}
                      </span>
                      <span className="font-medium">{count} 个</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 缓存信息 */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-700 dark:text-blue-300">
                    <p className="font-medium mb-1">缓存说明</p>
                    <ul className="space-y-1 text-xs">
                      <li>• 缩略图自动保存到本地 images 目录</li>
                      <li>• 使用 IndexedDB 管理文件映射关系</li>
                      <li>• 内存缓存提供快速访问</li>
                      <li>• 过期文件会自动清理（30天）</li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              无法加载缓存统计信息
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-between p-6 border-t bg-muted/20">
          <button
            onClick={loadStats}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            刷新统计
          </button>
          
          <button
            onClick={cleanupCache}
            disabled={cleaning || loading}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            <Trash2 className={cn("w-4 h-4", cleaning && "animate-pulse")} />
            {cleaning ? '清理中...' : '清理缓存'}
          </button>
        </div>
      </div>
    </div>
  );
}