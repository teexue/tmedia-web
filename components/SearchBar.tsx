'use client';

import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { Search, X, Filter } from 'lucide-react';
import { MediaFile, FileSystemItem } from '@/lib/types';
import { getMediaTypeDisplayName } from '@/lib/mediaTypes';
import { debounce, cn } from '@/lib/utils';

interface SearchBarProps {
  directories: FileSystemItem[];
  mediaFiles: MediaFile[];
  onFilteredResults: (directories: FileSystemItem[], mediaFiles: MediaFile[]) => void;
  className?: string;
}

export interface SearchBarRef {
  focusSearch: () => void;
}

const SearchBar = forwardRef<SearchBarRef, SearchBarProps>(({
  directories,
  mediaFiles,
  onFilteredResults,
  className
}, ref) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMediaType, setSelectedMediaType] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // 防抖搜索函数
  const debouncedSearch = debounce((query: string, mediaType: string) => {
    performSearch(query, mediaType);
  }, 300);

  // 执行搜索和过滤
  const performSearch = (query: string, mediaType: string) => {
    let filteredDirectories = directories;
    let filteredMediaFiles = mediaFiles;

    // 文本搜索
    if (query.trim()) {
      const searchTerm = query.toLowerCase();
      filteredDirectories = directories.filter(dir =>
        dir.name.toLowerCase().includes(searchTerm)
      );
      filteredMediaFiles = mediaFiles.filter(file =>
        file.name.toLowerCase().includes(searchTerm)
      );
    }

    // 媒体类型过滤
    if (mediaType !== 'all') {
      filteredMediaFiles = filteredMediaFiles.filter(file =>
        file.mediaType === mediaType
      );
    }

    onFilteredResults(filteredDirectories, filteredMediaFiles);
  };

  // 处理搜索输入变化
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    debouncedSearch(value, selectedMediaType);
  };

  // 处理媒体类型过滤变化
  const handleMediaTypeChange = (mediaType: string) => {
    setSelectedMediaType(mediaType);
    debouncedSearch(searchQuery, mediaType);
  };

  // 清除搜索
  const clearSearch = () => {
    setSearchQuery('');
    setSelectedMediaType('all');
    onFilteredResults(directories, mediaFiles);
  };

  // 当原始数据变化时重新搜索
  useEffect(() => {
    if (searchQuery || selectedMediaType !== 'all') {
      performSearch(searchQuery, selectedMediaType);
    } else {
      onFilteredResults(directories, mediaFiles);
    }
  }, [directories, mediaFiles]);

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    focusSearch: () => searchInputRef.current?.focus()
  }));

  const hasActiveFilters = searchQuery.trim() || selectedMediaType !== 'all';

  return (
    <div className={cn("space-y-3", className)}>
      {/* 搜索输入框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="搜索文件和文件夹..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className={cn(
            "w-full pl-10 pr-12 py-2 border border-border rounded-lg",
            "bg-background text-foreground placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
            "transition-colors"
          )}
        />

        {/* 清除按钮 */}
        {hasActiveFilters && (
          <button
            onClick={clearSearch}
            className="absolute right-8 top-1/2 transform -translate-y-1/2 p-1 hover:bg-accent rounded-md transition-colors"
            title="清除搜索"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}

        {/* 过滤器按钮 */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "absolute right-3 top-1/2 transform -translate-y-1/2 p-1 rounded-md transition-colors",
            showFilters ? "bg-primary text-primary-foreground" : "hover:bg-accent"
          )}
          title="过滤选项"
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {/* 过滤器选项 */}
      {showFilters && (
        <div className="p-4 bg-muted/30 rounded-lg border space-y-3">
          <h4 className="font-medium text-sm">媒体类型过滤</h4>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleMediaTypeChange('all')}
              className={cn(
                "px-3 py-1 text-sm rounded-full border transition-colors",
                selectedMediaType === 'all'
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-accent border-border"
              )}
            >
              全部
            </button>
            <button
              onClick={() => handleMediaTypeChange('video')}
              className={cn(
                "px-3 py-1 text-sm rounded-full border transition-colors",
                selectedMediaType === 'video'
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-accent border-border"
              )}
            >
              {getMediaTypeDisplayName('video')}
            </button>
            <button
              onClick={() => handleMediaTypeChange('audio')}
              className={cn(
                "px-3 py-1 text-sm rounded-full border transition-colors",
                selectedMediaType === 'audio'
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-accent border-border"
              )}
            >
              {getMediaTypeDisplayName('audio')}
            </button>
            <button
              onClick={() => handleMediaTypeChange('image')}
              className={cn(
                "px-3 py-1 text-sm rounded-full border transition-colors",
                selectedMediaType === 'image'
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-accent border-border"
              )}
            >
              {getMediaTypeDisplayName('image')}
            </button>
          </div>
        </div>
      )}

      {/* 搜索结果统计 */}
      {hasActiveFilters && (
        <div className="text-sm text-muted-foreground">
          找到 {directories.length} 个文件夹和 {mediaFiles.length} 个媒体文件
        </div>
      )}
    </div>
  );
});

SearchBar.displayName = 'SearchBar';

export default SearchBar;