"use client";

import {
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react";
import { DirectoryContent, FileSystemItem, MediaFile } from "@/lib/types";
import { fileSystemService } from "@/lib/fileSystem";

import MediaCard from "./MediaCard";
import SearchBar from "./SearchBar";
import { Loader2, AlertCircle, RefreshCw, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileExplorerProps {
  currentDirectory: FileSystemDirectoryHandle;
  onDirectoryChange: (directory: FileSystemDirectoryHandle) => void;
  onMediaFileSelect: (mediaFile: MediaFile, mediaList?: MediaFile[]) => void;
  className?: string;
}

export interface FileExplorerRef {
  refresh: () => void;
  focusSearch: () => void;
}

const FileExplorer = forwardRef<FileExplorerRef, FileExplorerProps>(
  (
    { currentDirectory, onDirectoryChange, onMediaFileSelect, className },
    ref
  ) => {
    const [content, setContent] = useState<DirectoryContent | null>(null);
    const [filteredContent, setFilteredContent] = useState<{
      directories: FileSystemItem[];
      mediaFiles: MediaFile[];
    } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isFlattened, setIsFlattened] = useState(false);

    const searchBarRef = useRef<{ focusSearch: () => void } | null>(null);

    // 加载目录内容
    const loadDirectoryContent = async (
      directory: FileSystemDirectoryHandle,
      flatten = false
    ) => {
      setLoading(true);
      setError(null);

      try {
        const directoryContent = flatten
          ? await fileSystemService.readDirectoryFlat(directory, 3)
          : await fileSystemService.readDirectory(directory);

        setContent(directoryContent);
        setFilteredContent({
          directories: directoryContent.directories,
          mediaFiles: directoryContent.mediaFiles,
        });
      } catch (error) {
        if (error instanceof Error) {
          setError(error.message);
        } else {
          setError("加载目录内容时发生未知错误");
        }
        setContent(null);
        setFilteredContent(null);
      } finally {
        setLoading(false);
      }
    };

    // 当目录改变时重新加载内容
    useEffect(() => {
      if (currentDirectory) {
        loadDirectoryContent(currentDirectory, isFlattened);
      }
    }, [currentDirectory, isFlattened]);

    // 处理子目录点击
    const handleDirectoryClick = async (directory: FileSystemItem) => {
      if (directory.handle.kind === "directory") {
        onDirectoryChange(directory.handle as FileSystemDirectoryHandle);
      }
    };

    // 处理媒体文件点击
    const handleMediaFileClick = (mediaFile: MediaFile) => {
      // 传递当前的媒体文件列表以支持导航
      onMediaFileSelect(mediaFile, filteredContent?.mediaFiles || []);
    };

    // 刷新当前目录
    const handleRefresh = () => {
      if (currentDirectory) {
        loadDirectoryContent(currentDirectory, isFlattened);
      }
    };

    // 切换扁平化模式
    const toggleFlattened = () => {
      setIsFlattened(!isFlattened);
    };

    // 处理搜索过滤结果
    const handleFilteredResults = (
      directories: FileSystemItem[],
      mediaFiles: MediaFile[]
    ) => {
      setFilteredContent({ directories, mediaFiles });
    };

    // 暴露给父组件的方法
    useImperativeHandle(ref, () => ({
      refresh: handleRefresh,
      focusSearch: () => searchBarRef.current?.focusSearch(),
    }));

    if (loading) {
      return (
        <div
          className={cn(
            "flex flex-col items-center justify-center py-16",
            className
          )}
        >
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">正在加载文件夹内容...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div
          className={cn(
            "flex flex-col items-center justify-center py-16",
            className
          )}
        >
          <AlertCircle className="w-12 h-12 text-destructive mb-4" />
          <h3 className="text-lg font-medium mb-2">加载失败</h3>
          <p className="text-muted-foreground mb-4 text-center max-w-md">
            {error}
          </p>
          <button
            onClick={handleRefresh}
            className={cn(
              "flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md",
              "hover:bg-primary/90 transition-colors"
            )}
          >
            <RefreshCw className="w-4 h-4" />
            重试
          </button>
        </div>
      );
    }

    if (!content || !filteredContent) {
      return null;
    }

    return (
      <div className={cn("space-y-4", className)}>
        {/* 搜索栏 */}
        <SearchBar
          ref={searchBarRef}
          directories={content.directories}
          mediaFiles={content.mediaFiles}
          onFilteredResults={handleFilteredResults}
        />

        {/* 工具栏 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>
              {isFlattened ? "0" : filteredContent.directories.length} 个文件夹
            </span>
            <span>{filteredContent.mediaFiles.length} 个媒体文件</span>
            {(filteredContent.directories.length !==
              content.directories.length ||
              filteredContent.mediaFiles.length !==
                content.mediaFiles.length) && (
              <span className="text-primary">(已过滤)</span>
            )}
            {isFlattened && (
              <span className="text-blue-600 dark:text-blue-400">
                (扁平化显示)
              </span>
            )}
            {loading && (
              <span className="flex items-center gap-1 text-primary">
                <Loader2 className="w-3 h-3 animate-spin" />
                加载中...
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* 扁平化切换 */}
            <button
              onClick={toggleFlattened}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors",
                isFlattened
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
              title={isFlattened ? "关闭扁平化" : "开启扁平化"}
              disabled={loading}
            >
              <Layers className="w-4 h-4" />
              扁平化
            </button>

            {/* 刷新按钮 */}
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              title="刷新"
              disabled={loading}
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              刷新
            </button>
          </div>
        </div>

        {/* 文件显示区域 - 卡片视图 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {/* 在非扁平模式下显示文件夹 */}
          {!isFlattened &&
            filteredContent.directories.map((directory) => (
              <div
                key={directory.path}
                onClick={() => handleDirectoryClick(directory)}
                className="cursor-pointer p-4 rounded-lg border border-border hover:border-primary hover:shadow-md transition-all duration-200 bg-card hover:bg-accent/50 flex flex-col items-center text-center space-y-3"
              >
                <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M4 7V17C4 18.1046 4.89543 19 6 19H18C19.1046 19 20 18.1046 20 17V9C20 7.89543 19.1046 7 18 7H12L10 5H6C4.89543 5 4 5.89543 4 7Z"
                      fill="currentColor"
                      className="text-muted-foreground"
                    />
                  </svg>
                </div>
                <div className="space-y-1 w-full">
                  <h3
                    className="text-sm font-medium break-words leading-tight text-center px-2"
                    title={directory.name}
                  >
                    {directory.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">文件夹</p>
                </div>
              </div>
            ))}

          {/* 显示媒体文件 */}
          {filteredContent.mediaFiles.map((mediaFile) => (
            <MediaCard
              key={mediaFile.path}
              mediaFile={mediaFile}
              onClick={handleMediaFileClick}
              showPath={isFlattened}
            />
          ))}

          {/* 空状态提示 */}
          {filteredContent.mediaFiles.length === 0 &&
            (!isFlattened
              ? filteredContent.directories.length === 0
              : true) && (
              <div className="col-span-full text-center py-16">
                <p className="text-muted-foreground">
                  {isFlattened ? "没有找到媒体文件" : "没有找到文件和文件夹"}
                </p>
              </div>
            )}
        </div>
      </div>
    );
  }
);

FileExplorer.displayName = "FileExplorer";

export default FileExplorer;
