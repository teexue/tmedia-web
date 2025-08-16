'use client';

import { ChevronRight, Home, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  name: string;
  handle: FileSystemDirectoryHandle;
}

interface BreadcrumbNavProps {
  currentPath: BreadcrumbItem[];
  onNavigate: (directory: FileSystemDirectoryHandle, index: number) => void;
  onBack?: () => void;
  className?: string;
}

export default function BreadcrumbNav({
  currentPath,
  onNavigate,
  onBack,
  className
}: BreadcrumbNavProps) {
  const canGoBack = currentPath.length > 1;

  return (
    <div className={cn(
      "flex items-center gap-2 p-4 bg-muted/30 rounded-lg border",
      className
    )}>
      {/* 返回按钮 */}
      {canGoBack && onBack && (
        <button
          onClick={onBack}
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 text-sm rounded-md",
            "hover:bg-accent transition-colors",
            "text-muted-foreground hover:text-foreground"
          )}
          title="返回上级目录"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>
      )}

      {/* 面包屑导航 */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {currentPath.map((item, index) => (
          <div key={index} className="flex items-center gap-1 min-w-0">
            {/* 路径项 */}
            <button
              onClick={() => onNavigate(item.handle, index)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-sm rounded-md transition-colors min-w-0",
                index === currentPath.length - 1
                  ? "text-foreground font-medium cursor-default"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
              )}
              disabled={index === currentPath.length - 1}
            >
              {index === 0 && <Home className="w-4 h-4 flex-shrink-0" />}
              <span className="truncate">
                {index === 0 ? '根目录' : item.name}
              </span>
            </button>

            {/* 分隔符 */}
            {index < currentPath.length - 1 && (
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* 当前路径信息 */}
      <div className="text-xs text-muted-foreground hidden sm:block">
        {currentPath.length > 1 && (
          <span>深度: {currentPath.length - 1}</span>
        )}
      </div>
    </div>
  );
}