"use client";

import { useState, useRef, useEffect } from "react";
import { MediaFile } from "@/lib/types";
import DirectorySelector from "@/components/DirectorySelector";
import FileExplorer from "@/components/FileExplorer";
import BreadcrumbNav from "@/components/BreadcrumbNav";
import MediaPlayer from "@/components/MediaPlayer";
import ErrorBoundary from "@/components/ErrorBoundary";
import CacheManager from "@/components/CacheManager";
import {
  useKeyboardShortcuts,
  createFileExplorerShortcuts,
} from "@/lib/keyboard";
import { createMediaNavigationManager } from "@/lib/mediaNavigation";
import { Database } from "lucide-react";

interface BreadcrumbItem {
  name: string;
  handle: FileSystemDirectoryHandle;
}

export default function Home() {
  // 应用状态
  const [rootDirectory, setRootDirectory] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [currentDirectory, setCurrentDirectory] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [navigationPath, setNavigationPath] = useState<BreadcrumbItem[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null);
  const [currentMediaList, setCurrentMediaList] = useState<MediaFile[]>([]);
  const [showCacheManager, setShowCacheManager] = useState(false);

  const fileExplorerRef = useRef<{
    refresh: () => void;
    focusSearch: () => void;
  } | null>(null);

  // 创建媒体导航管理器
  const mediaNavigationManager = useRef(
    createMediaNavigationManager({
      onMediaChange: (media: MediaFile) => {
        setSelectedMedia(media);
      },
    })
  );

  // 处理目录选择
  const handleDirectorySelected = (
    directoryHandle: FileSystemDirectoryHandle
  ) => {
    setRootDirectory(directoryHandle);
    setCurrentDirectory(directoryHandle);
    setNavigationPath([
      { name: directoryHandle.name, handle: directoryHandle },
    ]);
  };

  // 处理目录导航
  const handleDirectoryChange = (
    directoryHandle: FileSystemDirectoryHandle
  ) => {
    setCurrentDirectory(directoryHandle);

    // 更新导航路径
    const newPath = [
      ...navigationPath,
      { name: directoryHandle.name, handle: directoryHandle },
    ];
    setNavigationPath(newPath);
  };

  // 处理面包屑导航
  const handleBreadcrumbNavigate = (
    directoryHandle: FileSystemDirectoryHandle,
    index: number
  ) => {
    setCurrentDirectory(directoryHandle);
    // 截取路径到指定索引
    setNavigationPath(navigationPath.slice(0, index + 1));
  };

  // 处理返回上级目录
  const handleGoBack = () => {
    if (navigationPath.length > 1) {
      const parentPath = navigationPath.slice(0, -1);
      const parentDirectory = parentPath[parentPath.length - 1];
      setCurrentDirectory(parentDirectory.handle);
      setNavigationPath(parentPath);
    }
  };

  // 处理媒体文件选择
  const handleMediaFileSelect = (
    mediaFile: MediaFile,
    mediaList?: MediaFile[]
  ) => {
    setSelectedMedia(mediaFile);

    // 如果提供了媒体列表，更新导航管理器
    if (mediaList) {
      setCurrentMediaList(mediaList);
      mediaNavigationManager.current.setMediaList(mediaList);
      mediaNavigationManager.current.setCurrentMedia(mediaFile);
    }
  };

  // 处理媒体导航
  const handleNavigateNext = () => {
    // 如果当前媒体是图片，只在图片间导航
    if (selectedMedia?.mediaType === "image") {
      let nextMedia = mediaNavigationManager.current.goToNext();
      // 跳过非图片文件
      while (nextMedia && nextMedia.mediaType !== "image") {
        nextMedia = mediaNavigationManager.current.goToNext();
      }
      if (nextMedia) {
        setSelectedMedia(nextMedia);
      }
    } else {
      // 对于视频和音频，正常导航
      const nextMedia = mediaNavigationManager.current.goToNext();
      if (nextMedia) {
        setSelectedMedia(nextMedia);
      }
    }
  };

  const handleNavigatePrevious = () => {
    // 如果当前媒体是图片，只在图片间导航
    if (selectedMedia?.mediaType === "image") {
      let previousMedia = mediaNavigationManager.current.goToPrevious();
      // 跳过非图片文件
      while (previousMedia && previousMedia.mediaType !== "image") {
        previousMedia = mediaNavigationManager.current.goToPrevious();
      }
      if (previousMedia) {
        setSelectedMedia(previousMedia);
      }
    } else {
      // 对于视频和音频，正常导航
      const previousMedia = mediaNavigationManager.current.goToPrevious();
      if (previousMedia) {
        setSelectedMedia(previousMedia);
      }
    }
  };

  // 获取导航状态
  const getFilteredNavigationState = () => {
    const baseState = mediaNavigationManager.current.getNavigationState();

    // 如果当前媒体是图片，计算仅在图片间的导航状态
    if (selectedMedia?.mediaType === "image" && currentMediaList.length > 0) {
      const imageFiles = currentMediaList.filter(
        (media) => media.mediaType === "image"
      );
      const currentImageIndex = imageFiles.findIndex(
        (media) =>
          media.path === selectedMedia.path && media.name === selectedMedia.name
      );

      return {
        ...baseState,
        canGoNext:
          currentImageIndex >= 0 && currentImageIndex < imageFiles.length - 1,
        canGoPrevious: currentImageIndex > 0,
      };
    }

    return baseState;
  };

  const navigationState = getFilteredNavigationState();

  // 关闭媒体播放器
  const handleCloseMediaPlayer = () => {
    setSelectedMedia(null);
  };

  // 重置应用状态（选择新目录）
  const handleSelectNewDirectory = () => {
    setRootDirectory(null);
    setCurrentDirectory(null);
    setNavigationPath([]);
    setSelectedMedia(null);
  };

  // 刷新当前目录
  const handleRefresh = () => {
    fileExplorerRef.current?.refresh();
  };

  // 聚焦搜索框
  const handleFocusSearch = () => {
    fileExplorerRef.current?.focusSearch();
  };

  // 文件浏览器快捷键
  const fileExplorerShortcuts = createFileExplorerShortcuts(
    handleRefresh,
    navigationPath.length > 1 ? handleGoBack : undefined,
    handleFocusSearch
  );

  useKeyboardShortcuts(
    fileExplorerShortcuts,
    !!currentDirectory && !selectedMedia
  );

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background">
        {/* 主要内容区域 */}
        <div className="container mx-auto px-4 py-6">
          {!rootDirectory ? (
            // 目录选择界面
            <DirectorySelector onDirectorySelected={handleDirectorySelected} />
          ) : (
            // 文件浏览界面
            <div className="space-y-6">
              {/* 顶部操作栏 */}
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">多媒体播放器</h1>
                <div className="flex items-center gap-3">
                  <div className="text-xs text-muted-foreground hidden sm:block">
                    按 F5 刷新 • Ctrl+F 搜索 • Backspace 返回
                  </div>
                  <button
                    onClick={() => setShowCacheManager(true)}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-muted text-muted-foreground rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                    title="缓存管理"
                  >
                    <Database className="w-4 h-4" />
                    缓存
                  </button>
                  <button
                    onClick={handleSelectNewDirectory}
                    className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                  >
                    选择其他文件夹
                  </button>
                </div>
              </div>

              {/* 面包屑导航 */}
              <BreadcrumbNav
                currentPath={navigationPath}
                onNavigate={handleBreadcrumbNavigate}
                onBack={handleGoBack}
              />

              {/* 文件浏览器 */}
              {currentDirectory && (
                <FileExplorer
                  ref={fileExplorerRef}
                  currentDirectory={currentDirectory}
                  onDirectoryChange={handleDirectoryChange}
                  onMediaFileSelect={handleMediaFileSelect}
                />
              )}
            </div>
          )}
        </div>

        {/* 媒体播放器模态框 */}
        <MediaPlayer
          mediaFile={selectedMedia}
          mediaList={currentMediaList}
          onClose={handleCloseMediaPlayer}
          onNavigateNext={handleNavigateNext}
          onNavigatePrevious={handleNavigatePrevious}
          canNavigateNext={navigationState.canGoNext}
          canNavigatePrevious={navigationState.canGoPrevious}
        />

        {/* 缓存管理器 */}
        <CacheManager
          isOpen={showCacheManager}
          onClose={() => setShowCacheManager(false)}
        />
      </div>
    </ErrorBoundary>
  );
}
