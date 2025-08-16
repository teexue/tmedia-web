"use client";

import { useState, useEffect, useRef } from "react";
import { MediaFile } from "@/lib/types";
import { createFileURL, revokeFileURL } from "@/lib/fileSystem";
import { getMediaTypeDisplayName, formatFileSize } from "@/lib/mediaTypes";
import { formatDate, cn } from "@/lib/utils";
import {
  useKeyboardShortcuts,
  createMediaPlayerShortcuts,
} from "@/lib/keyboard";
import { fullscreenService } from "@/lib/fullscreen";
import { useImageCache } from "@/lib/imageCache";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  X,
  AlertCircle,
  Loader2,
  Keyboard,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface MediaPlayerProps {
  mediaFile: MediaFile | null;
  mediaList?: MediaFile[];
  onClose: () => void;
  onNavigateNext?: () => void;
  onNavigatePrevious?: () => void;
  canNavigateNext?: boolean;
  canNavigatePrevious?: boolean;
  className?: string;
}

export default function MediaPlayer({
  mediaFile,
  mediaList = [],
  onClose,
  onNavigateNext,
  onNavigatePrevious,
  canNavigateNext = false,
  canNavigatePrevious = false,
  className,
}: MediaPlayerProps) {
  const [fileURL, setFileURL] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageTransition, setImageTransition] = useState(false);
  const [cacheStatusMap, setCacheStatusMap] = useState<Map<string, boolean>>(
    new Map()
  );
  const [cacheStats, setCacheStats] = useState<{
    count: number;
    maxSize: number;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fullscreenCleanupRef = useRef<(() => void) | null>(null);

  // 图片缓存服务
  const {
    getCachedImageURL,
    preloadSurroundingImages,
    isCached,
    getCacheStats,
  } = useImageCache();

  // 更新缓存状态指示器
  useEffect(() => {
    if (mediaFile?.mediaType === "image" && mediaList.length > 1) {
      const imageFiles = mediaList.filter((file) => file.mediaType === "image");
      const currentImageIndex = imageFiles.findIndex(
        (file) => file.path === mediaFile.path && file.name === mediaFile.name
      );

      if (currentImageIndex !== -1) {
        const range = 2;
        const startIndex = Math.max(0, currentImageIndex - range);
        const endIndex = Math.min(
          imageFiles.length - 1,
          currentImageIndex + range
        );

        // 异步检查每个图片的缓存状态
        const checkCacheStatus = async () => {
          const newCacheStatusMap = new Map<string, boolean>();

          for (let i = startIndex; i <= endIndex; i++) {
            const imageFile = imageFiles[i];
            const cacheKey = `${imageFile.path}_${imageFile.name}`;
            try {
              const cached = await isCached(imageFile);
              newCacheStatusMap.set(cacheKey, cached);
            } catch (error) {
              console.warn("检查缓存状态失败:", error);
              newCacheStatusMap.set(cacheKey, false);
            }
          }

          setCacheStatusMap(newCacheStatusMap);
        };

        checkCacheStatus();

        // 同时更新缓存统计信息
        getCacheStats()
          .then((stats) => {
            setCacheStats(stats);
          })
          .catch((error) => {
            console.warn("获取缓存统计失败:", error);
          });
      }
    }
  }, [mediaFile, mediaList, isCached, getCacheStats]);

  // 加载媒体文件
  useEffect(() => {
    if (!mediaFile) {
      setFileURL(null);
      setError(null);
      return;
    }

    const loadMedia = async () => {
      setLoading(true);
      setError(null);

      try {
        let url: string;

        // 对图片使用缓存服务，对视频和音频使用直接加载
        if (mediaFile.mediaType === "image") {
          url = await getCachedImageURL(mediaFile);
        } else {
          url = await createFileURL(mediaFile.handle as FileSystemFileHandle);
        }

        setFileURL(url);

        // 如果是图片且有媒体列表，预加载周围的图片
        if (mediaFile.mediaType === "image" && mediaList.length > 0) {
          const currentIndex = mediaList.findIndex(
            (file) =>
              file.path === mediaFile.path && file.name === mediaFile.name
          );
          if (currentIndex !== -1) {
            // 异步预加载，不阻塞当前图片显示
            preloadSurroundingImages(mediaList, currentIndex);
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          setError(error.message);
        } else {
          setError("加载媒体文件时发生未知错误");
        }
      } finally {
        setLoading(false);
      }
    };

    loadMedia();

    // 清理函数 - 对于图片，由缓存服务管理URL生命周期
    return () => {
      if (fileURL && mediaFile?.mediaType !== "image") {
        revokeFileURL(fileURL);
      }
    };
  }, [mediaFile, mediaList, getCachedImageURL, preloadSurroundingImages]);

  // 清理 URL
  useEffect(() => {
    return () => {
      if (fileURL) {
        revokeFileURL(fileURL);
      }
    };
  }, [fileURL]);

  // 确保获取媒体时长 - 处理一些边缘情况
  useEffect(() => {
    if (!fileURL || !mediaFile) return;

    const timer = setTimeout(() => {
      // 如果5秒后还是没有获取到duration，尝试手动获取
      if (duration === 0) {
        const mediaElement = videoRef.current || audioRef.current;
        if (
          mediaElement &&
          mediaElement.duration &&
          !isNaN(mediaElement.duration)
        ) {
          console.log("延迟获取到duration:", mediaElement.duration);
          setDuration(mediaElement.duration);
        } else {
          console.warn("无法获取媒体文件时长，可能是文件损坏或格式不支持");
        }
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [fileURL, mediaFile, duration]);

  // 重置播放状态 - 当组件关闭或加载新媒体时
  useEffect(() => {
    // 当mediaFile变化时，重置所有播放相关状态
    if (mediaFile) {
      // 重置播放状态
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setError(null);

      // 如果有媒体元素，也停止播放并重置
      const mediaElement = videoRef.current || audioRef.current;
      if (mediaElement) {
        mediaElement.pause();
        mediaElement.currentTime = 0;
      }
    }
  }, [mediaFile?.path, mediaFile?.name]); // 使用path和name作为依赖，确保不同文件时触发

  // 组件卸载或关闭时的清理
  useEffect(() => {
    return () => {
      // 组件卸载时停止播放
      const mediaElement = videoRef.current || audioRef.current;
      if (mediaElement) {
        mediaElement.pause();
      }
    };
  }, []);

  // 播放/暂停控制
  const togglePlayPause = () => {
    const mediaElement = videoRef.current || audioRef.current;
    if (!mediaElement) return;

    if (isPlaying) {
      mediaElement.pause();
    } else {
      mediaElement.play();
    }
  };

  // 音量控制
  const adjustVolumeValue = (newVolume: number) => {
    setVolume(newVolume);
    const mediaElement = videoRef.current || audioRef.current;
    if (mediaElement) {
      mediaElement.volume = newVolume;
    }
  };

  // 静音切换
  const toggleMute = () => {
    setIsMuted(!isMuted);
    const mediaElement = videoRef.current || audioRef.current;
    if (mediaElement) {
      mediaElement.muted = !isMuted;
    }
  };

  // 进度条控制
  const handleSeek = (newTime: number) => {
    const mediaElement = videoRef.current || audioRef.current;
    if (mediaElement) {
      mediaElement.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // 媒体事件处理 - 避免重复绑定
  const handleLoadedMetadata = (
    element: HTMLVideoElement | HTMLAudioElement
  ) => {
    console.log("视频元数据已加载，duration:", element.duration);
    setDuration(element.duration || 0);
    // 同时设置其他初始状态
    setVolume(element.volume);
    setIsMuted(element.muted);
    setCurrentTime(element.currentTime);
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);
  const handleTimeUpdate = (element: HTMLVideoElement | HTMLAudioElement) => {
    setCurrentTime(element.currentTime);
  };
  const handleVolumeChange = (element: HTMLVideoElement | HTMLAudioElement) => {
    setVolume(element.volume);
    setIsMuted(element.muted);
  };
  const handleError = () => {
    setError("媒体文件无法播放，可能格式不受支持");
  };

  // 全屏功能
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      await fullscreenService.toggleFullscreen(containerRef.current);
    } catch (error) {
      console.warn("全屏操作失败:", error);
    }
  };

  // 监听全屏状态变化
  useEffect(() => {
    const cleanup = fullscreenService.onFullscreenChange((isFullscreen) => {
      setIsFullscreen(isFullscreen);
    });

    return cleanup;
  }, []);

  // 全屏显示优化 - 设置监听器，服务会自动判断是否应用样式
  useEffect(() => {
    if (!fileURL || !containerRef.current) return;

    // 清理之前的优化设置
    if (fullscreenCleanupRef.current) {
      fullscreenCleanupRef.current();
      fullscreenCleanupRef.current = null;
    }

    // 为不同类型的媒体设置全屏优化监听器
    if (mediaFile?.mediaType === "image" && imageRef.current) {
      fullscreenCleanupRef.current = fullscreenService.optimizeForFullscreen(
        imageRef.current,
        containerRef.current,
        {
          mode: "fit",
          maintainAspectRatio: true,
          backgroundColor: "#000000",
        }
      );
    } else if (mediaFile?.mediaType === "video" && videoRef.current) {
      fullscreenCleanupRef.current = fullscreenService.optimizeForFullscreen(
        videoRef.current,
        containerRef.current,
        {
          mode: "fit",
          maintainAspectRatio: true,
          backgroundColor: "#000000",
        }
      );
    }

    // 清理函数
    return () => {
      if (fullscreenCleanupRef.current) {
        fullscreenCleanupRef.current();
        fullscreenCleanupRef.current = null;
      }
    };
  }, [fileURL, mediaFile?.mediaType]);

  // 格式化时间
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds === 0) {
      return "--:--";
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // 音量调节
  const adjustVolume = (delta: number) => {
    const newVolume = Math.max(0, Math.min(1, volume + delta));
    adjustVolumeValue(newVolume);
  };

  // 时间跳转
  const seekTime = (delta: number) => {
    const mediaElement = videoRef.current || audioRef.current;
    if (mediaElement) {
      const newTime = Math.max(0, Math.min(duration, currentTime + delta));
      handleSeek(newTime);
    }
  };

  // 图像导航功能
  const handleNavigateNext = () => {
    if (canNavigateNext && onNavigateNext) {
      setImageTransition(true);

      // 由于本地缓存，所有导航都使用较快的切换速度
      setTimeout(() => {
        onNavigateNext();
        setImageTransition(false);
      }, 100);
    }
  };

  const handleNavigatePrevious = () => {
    if (canNavigatePrevious && onNavigatePrevious) {
      setImageTransition(true);

      // 由于本地缓存，所有导航都使用较快的切换速度
      setTimeout(() => {
        onNavigatePrevious();
        setImageTransition(false);
      }, 100);
    }
  };

  // 处理键盘导航（仅图片模式）
  const handleImageNavigation = (direction: "next" | "previous") => {
    if (mediaFile?.mediaType !== "image") return;

    if (direction === "next") {
      handleNavigateNext();
    } else {
      handleNavigatePrevious();
    }
  };

  // 键盘快捷键
  const shortcuts = createMediaPlayerShortcuts(
    isPlaying,
    togglePlayPause,
    () => adjustVolume(0.1),
    () => adjustVolume(-0.1),
    // 对于图片，左右箭头用于导航；对于视频/音频，用于时间跳转
    mediaFile?.mediaType === "image"
      ? () => handleImageNavigation("next")
      : () => seekTime(10),
    mediaFile?.mediaType === "image"
      ? () => handleImageNavigation("previous")
      : () => seekTime(-10),
    toggleFullscreen,
    onClose
  );

  useKeyboardShortcuts(shortcuts, !!mediaFile && !loading && !error);

  if (!mediaFile) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center transition-all duration-300",
        {
          "p-0 bg-black": isFullscreen,
          "p-4 bg-black/80 backdrop-blur-sm": !isFullscreen,
        },
        className
      )}
    >
      <div
        className={cn(
          "shadow-2xl overflow-hidden relative transition-all duration-300",
          {
            "w-full h-full bg-black": isFullscreen,
            "bg-background rounded-lg max-w-4xl w-full max-h-[90vh]":
              !isFullscreen,
          }
        )}
      >
        {/* 头部 - 全屏时隐藏 */}
        {!isFullscreen && (
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold truncate">{mediaFile.name}</h2>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                <span>{getMediaTypeDisplayName(mediaFile.mediaType)}</span>
                {mediaFile.size && (
                  <span>{formatFileSize(mediaFile.size)}</span>
                )}
                {mediaFile.lastModified && (
                  <span>{formatDate(mediaFile.lastModified)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowShortcuts(!showShortcuts)}
                className="p-2 hover:bg-accent rounded-md transition-colors"
                title="键盘快捷键"
              >
                <Keyboard className="w-5 h-5" />
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-accent rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* 全屏模式下的顶部控制栏 */}
        {isFullscreen && (
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-black/50 rounded-lg p-2 backdrop-blur-sm">
            <button
              onClick={() => setShowShortcuts(!showShortcuts)}
              className="p-2 hover:bg-white/10 text-white rounded-md transition-colors"
              title="键盘快捷键"
            >
              <Keyboard className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 text-white rounded-md transition-colors"
              title="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* 快捷键帮助 */}
        {showShortcuts && (
          <div
            className={cn(
              "p-4",
              isFullscreen
                ? "absolute top-16 left-4 right-4 bg-black/80 text-white rounded-lg backdrop-blur-sm z-10 max-w-md mx-auto"
                : "bg-muted/30 border-b"
            )}
          >
            <h3 className="font-medium mb-3">键盘快捷键</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {(mediaFile?.mediaType === "video" ||
                mediaFile?.mediaType === "audio") && (
                <div className="flex justify-between">
                  <span>播放/暂停</span>
                  <kbd
                    className={cn(
                      "px-2 py-1 rounded border text-xs",
                      isFullscreen
                        ? "bg-white/20 text-white border-white/30"
                        : "bg-background"
                    )}
                  >
                    空格
                  </kbd>
                </div>
              )}
              <div className="flex justify-between">
                <span>关闭播放器</span>
                <kbd
                  className={cn(
                    "px-2 py-1 rounded border text-xs",
                    isFullscreen
                      ? "bg-white/20 text-white border-white/30"
                      : "bg-background"
                  )}
                >
                  Esc
                </kbd>
              </div>
              {(mediaFile?.mediaType === "video" ||
                mediaFile?.mediaType === "audio") && (
                <>
                  <div className="flex justify-between">
                    <span>音量增加</span>
                    <kbd
                      className={cn(
                        "px-2 py-1 rounded border text-xs",
                        isFullscreen
                          ? "bg-white/20 text-white border-white/30"
                          : "bg-background"
                      )}
                    >
                      ↑
                    </kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>音量减少</span>
                    <kbd
                      className={cn(
                        "px-2 py-1 rounded border text-xs",
                        isFullscreen
                          ? "bg-white/20 text-white border-white/30"
                          : "bg-background"
                      )}
                    >
                      ↓
                    </kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>快进 10 秒</span>
                    <kbd
                      className={cn(
                        "px-2 py-1 rounded border text-xs",
                        isFullscreen
                          ? "bg-white/20 text-white border-white/30"
                          : "bg-background"
                      )}
                    >
                      →
                    </kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>快退 10 秒</span>
                    <kbd
                      className={cn(
                        "px-2 py-1 rounded border text-xs",
                        isFullscreen
                          ? "bg-white/20 text-white border-white/30"
                          : "bg-background"
                      )}
                    >
                      ←
                    </kbd>
                  </div>
                </>
              )}
              {mediaFile?.mediaType === "image" && (
                <>
                  <div className="flex justify-between">
                    <span>下一张图片</span>
                    <kbd
                      className={cn(
                        "px-2 py-1 rounded border text-xs",
                        isFullscreen
                          ? "bg-white/20 text-white border-white/30"
                          : "bg-background"
                      )}
                    >
                      →
                    </kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>上一张图片</span>
                    <kbd
                      className={cn(
                        "px-2 py-1 rounded border text-xs",
                        isFullscreen
                          ? "bg-white/20 text-white border-white/30"
                          : "bg-background"
                      )}
                    >
                      ←
                    </kbd>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span>全屏切换</span>
                <kbd
                  className={cn(
                    "px-2 py-1 rounded border text-xs",
                    isFullscreen
                      ? "bg-white/20 text-white border-white/30"
                      : "bg-background"
                  )}
                >
                  F
                </kbd>
              </div>
            </div>
          </div>
        )}

        {/* 内容区域 */}
        <div
          className={cn(
            isFullscreen
              ? "p-0 h-full relative flex items-center justify-center"
              : "p-4"
          )}
        >
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">正在加载媒体文件...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-16">
              <AlertCircle className="w-12 h-12 text-destructive mb-4" />
              <h3 className="text-lg font-medium mb-2">播放失败</h3>
              <p className="text-muted-foreground text-center">{error}</p>
            </div>
          )}

          {fileURL && !loading && !error && (
            <div
              className={cn(
                isFullscreen
                  ? "flex items-center justify-center w-full h-full"
                  : "space-y-4"
              )}
            >
              {/* 媒体元素 */}
              {mediaFile.mediaType === "video" && (
                <video
                  ref={videoRef}
                  src={fileURL}
                  className={cn(
                    "bg-black",
                    isFullscreen
                      ? "max-w-full max-h-full object-contain" // 全屏时确保适应容器
                      : "w-full max-h-[60vh] rounded-lg object-contain"
                  )}
                  controls={false}
                  preload="metadata"
                  playsInline
                  // 优化视频播放性能
                  crossOrigin="anonymous"
                  // 启用硬件加速
                  style={
                    isFullscreen
                      ? {
                          willChange: "transform",
                          transform: "translateZ(0)",
                        }
                      : {
                          willChange: "transform",
                          transform: "translateZ(0)",
                          objectFit: "contain",
                        }
                  }
                  onLoadedMetadata={(e) => {
                    const video = e.currentTarget;
                    // 设置视频质量偏好
                    if ("requestVideoFrameCallback" in video) {
                      // 现代浏览器支持的高性能视频渲染
                      video.style.imageRendering = "optimizeQuality";
                    }
                    handleLoadedMetadata(video);
                  }}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget)}
                  onVolumeChange={(e) => handleVolumeChange(e.currentTarget)}
                  onError={handleError}
                  onCanPlay={(e) => {
                    // 备用方案：如果loadedmetadata没有正确触发，尝试从canplay事件获取duration
                    const video = e.currentTarget;
                    if (
                      duration === 0 &&
                      video.duration &&
                      !isNaN(video.duration)
                    ) {
                      console.log("从canplay事件获取duration:", video.duration);
                      setDuration(video.duration);
                    }
                  }}
                  onDurationChange={(e) => {
                    // 直接监听duration变化事件
                    const video = e.currentTarget;
                    console.log("Duration变化事件触发:", video.duration);
                    if (video.duration && !isNaN(video.duration)) {
                      setDuration(video.duration);
                    }
                  }}
                />
              )}

              {mediaFile.mediaType === "audio" && (
                <div className="bg-muted/30 rounded-lg p-8 text-center">
                  <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Volume2 className="w-12 h-12 text-primary" />
                  </div>
                  <h3 className="font-medium mb-2">{mediaFile.name}</h3>
                  <p className="text-sm text-muted-foreground">音频文件</p>
                  <audio
                    ref={audioRef}
                    src={fileURL}
                    className="hidden"
                    preload="metadata"
                    onLoadedMetadata={(e) =>
                      handleLoadedMetadata(e.currentTarget)
                    }
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget)}
                    onVolumeChange={(e) => handleVolumeChange(e.currentTarget)}
                    onError={handleError}
                    onCanPlay={(e) => {
                      // 备用方案：如果loadedmetadata没有正确触发，尝试从canplay事件获取duration
                      const audio = e.currentTarget;
                      if (
                        duration === 0 &&
                        audio.duration &&
                        !isNaN(audio.duration)
                      ) {
                        console.log(
                          "从音频canplay事件获取duration:",
                          audio.duration
                        );
                        setDuration(audio.duration);
                      }
                    }}
                    onDurationChange={(e) => {
                      // 直接监听duration变化事件
                      const audio = e.currentTarget;
                      console.log("音频Duration变化事件触发:", audio.duration);
                      if (audio.duration && !isNaN(audio.duration)) {
                        setDuration(audio.duration);
                      }
                    }}
                  />
                </div>
              )}

              {mediaFile.mediaType === "image" && (
                <div className="relative text-center group">
                  {/* 图片容器 */}
                  <div className="relative inline-block">
                    <img
                      ref={imageRef}
                      src={fileURL}
                      alt={mediaFile.name}
                      className={cn(
                        "transition-all duration-300",
                        isFullscreen
                          ? "max-w-full max-h-full object-contain" // 全屏时确保适应容器
                          : "max-w-full max-h-[60vh] mx-auto rounded-lg object-contain"
                      )}
                      onError={() => setError("图片文件无法显示")}
                    />

                    {/* 导航按钮 - 仅在有多张图片时显示 */}
                    {mediaList.length > 1 && (
                      <>
                        {/* 上一张按钮 */}
                        <button
                          onClick={handleNavigatePrevious}
                          disabled={!canNavigatePrevious}
                          className={cn(
                            "absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full",
                            "transition-all duration-200 backdrop-blur-sm",
                            "opacity-0 group-hover:opacity-100",
                            canNavigatePrevious
                              ? "hover:bg-black/70 cursor-pointer"
                              : "opacity-30 cursor-not-allowed"
                          )}
                          title="上一张图片"
                        >
                          <ChevronLeft className="w-6 h-6" />
                        </button>

                        {/* 下一张按钮 */}
                        <button
                          onClick={handleNavigateNext}
                          disabled={!canNavigateNext}
                          className={cn(
                            "absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full",
                            "transition-all duration-200 backdrop-blur-sm",
                            "opacity-0 group-hover:opacity-100",
                            canNavigateNext
                              ? "hover:bg-black/70 cursor-pointer"
                              : "opacity-30 cursor-not-allowed"
                          )}
                          title="下一张图片"
                        >
                          <ChevronRight className="w-6 h-6" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* 图片信息和导航状态 - 仅在非全屏时显示 */}
                  {!isFullscreen && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          {mediaList.length > 1 && (
                            <>
                              <span>
                                {(() => {
                                  const imageFiles = mediaList.filter(
                                    (file) => file.mediaType === "image"
                                  );
                                  const currentImageIndex =
                                    imageFiles.findIndex(
                                      (file) =>
                                        file.path === mediaFile.path &&
                                        file.name === mediaFile.name
                                    );
                                  return `${currentImageIndex + 1} / ${
                                    imageFiles.length
                                  }`;
                                })()}
                              </span>
                              <span className="ml-4 text-xs">
                                使用左右箭头键或点击按钮切换图片
                              </span>
                            </>
                          )}
                        </div>

                        {/* 图片全屏按钮 */}
                        <button
                          onClick={toggleFullscreen}
                          className="p-2 hover:bg-accent rounded-md transition-colors"
                          title="全屏"
                        >
                          <Maximize className="w-5 h-5" />
                        </button>
                      </div>

                      {/* 缓存状态指示器 */}
                      {mediaFile.mediaType === "image" &&
                        mediaList.length > 1 && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>缓存状态:</span>
                            <div className="flex items-center gap-1">
                              {(() => {
                                const imageFiles = mediaList.filter(
                                  (file) => file.mediaType === "image"
                                );
                                const currentImageIndex = imageFiles.findIndex(
                                  (file) =>
                                    file.path === mediaFile.path &&
                                    file.name === mediaFile.name
                                );
                                const range = 2; // 显示前后2张的状态
                                const indicators = [];

                                for (
                                  let i = Math.max(
                                    0,
                                    currentImageIndex - range
                                  );
                                  i <=
                                  Math.min(
                                    imageFiles.length - 1,
                                    currentImageIndex + range
                                  );
                                  i++
                                ) {
                                  const isCurrentImage =
                                    i === currentImageIndex;
                                  const imageFile = imageFiles[i];
                                  const cacheKey = `${imageFile.path}_${imageFile.name}`;
                                  const cached =
                                    cacheStatusMap.get(cacheKey) || false;
                                  indicators.push(
                                    <div
                                      key={i}
                                      className={cn(
                                        "w-2 h-2 rounded-full",
                                        isCurrentImage
                                          ? "ring-1 ring-primary"
                                          : "",
                                        cached ? "bg-green-500" : "bg-gray-300"
                                      )}
                                      title={`图片 ${i + 1}${
                                        isCurrentImage ? " (当前)" : ""
                                      }${cached ? " - 已缓存" : " - 未缓存"}`}
                                    />
                                  );
                                }
                                return indicators;
                              })()}
                            </div>
                            <span className="text-[10px]">
                              (
                              {cacheStats
                                ? `${cacheStats.count}/${Math.floor(
                                    cacheStats.maxSize / (1024 * 1024)
                                  )}MB`
                                : "加载中..."}
                              )
                            </span>
                          </div>
                        )}
                    </div>
                  )}

                  {/* 全屏模式下的退出按钮 - 固定在右上角 */}
                  {isFullscreen && (
                    <button
                      onClick={toggleFullscreen}
                      className="fixed top-4 right-4 z-50 p-2 bg-black/50 text-white rounded-md backdrop-blur-sm transition-all duration-200 hover:bg-black/70 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/50"
                      title="退出全屏"
                    >
                      <Minimize className="w-5 h-5 transition-transform duration-200" />
                    </button>
                  )}
                </div>
              )}

              {/* 媒体控制器（仅视频和音频） */}
              {(mediaFile.mediaType === "video" ||
                mediaFile.mediaType === "audio") && (
                <div
                  className={cn(
                    "space-y-3",
                    isFullscreen &&
                      "absolute bottom-4 left-4 right-4 bg-black/80 rounded-lg p-4 backdrop-blur-sm z-50"
                  )}
                >
                  {/* 进度条 */}
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "text-sm min-w-[40px]",
                        isFullscreen ? "text-white" : "text-muted-foreground"
                      )}
                    >
                      {formatTime(currentTime)}
                    </span>
                    <div className="flex-1 relative flex items-center">
                      {/* 进度条背景轨道 */}
                      <div
                        className={cn(
                          "absolute inset-x-0 h-2 rounded-full top-1/2 -translate-y-1/2",
                          isFullscreen ? "bg-white/30" : "bg-muted"
                        )}
                      />
                      {/* 进度条填充 */}
                      <div
                        className="absolute h-2 rounded-full bg-primary top-1/2 -translate-y-1/2 transition-all duration-100"
                        style={{
                          width:
                            duration > 0
                              ? `${(currentTime / duration) * 100}%`
                              : "0%",
                        }}
                      />
                      {/* 滑块输入 */}
                      <input
                        type="range"
                        min={0}
                        max={duration || 100}
                        value={duration > 0 ? currentTime : 0}
                        onChange={(e) => handleSeek(Number(e.target.value))}
                        disabled={duration === 0}
                        className={cn(
                          "relative z-10 w-full h-4 rounded-lg appearance-none bg-transparent",
                          duration === 0
                            ? "cursor-not-allowed opacity-50"
                            : "cursor-pointer",
                          // Webkit样式 - 隐藏默认轨道，只保留拖拽手柄
                          "[&::-webkit-slider-track]:appearance-none [&::-webkit-slider-track]:bg-transparent",
                          "[&::-webkit-slider-track]:h-4 [&::-webkit-slider-track]:rounded-lg [&::-webkit-slider-track]:border-none",
                          "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4",
                          "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
                          "[&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg",
                          "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white",
                          "[&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-150",
                          "[&::-webkit-slider-thumb]:hover:scale-110",
                          // Firefox样式
                          "[&::-moz-range-track]:appearance-none [&::-moz-range-track]:bg-transparent",
                          "[&::-moz-range-track]:h-4 [&::-moz-range-track]:rounded-lg [&::-moz-range-track]:border-none",
                          "[&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4",
                          "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary",
                          "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white",
                          "[&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-lg",
                          "[&::-moz-range-thumb]:transition-all [&::-moz-range-thumb]:duration-150"
                        )}
                      />
                    </div>
                    <span
                      className={cn(
                        "text-sm min-w-[40px]",
                        isFullscreen ? "text-white" : "text-muted-foreground"
                      )}
                    >
                      {formatTime(duration)}
                    </span>
                  </div>

                  {/* 控制按钮 */}
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={togglePlayPause}
                      className={cn(
                        "p-3 rounded-full transition-colors",
                        isFullscreen
                          ? "bg-white/20 text-white hover:bg-white/30"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                      )}
                    >
                      {isPlaying ? (
                        <Pause className="w-6 h-6" />
                      ) : (
                        <Play className="w-6 h-6" />
                      )}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleMute}
                        className={cn(
                          "p-2 rounded-md transition-colors",
                          isFullscreen
                            ? "text-white hover:bg-white/10"
                            : "hover:bg-accent"
                        )}
                      >
                        {isMuted ? (
                          <VolumeX className="w-5 h-5" />
                        ) : (
                          <Volume2 className="w-5 h-5" />
                        )}
                      </button>
                      <div className="relative w-20 flex items-center">
                        {/* 音量条背景轨道 */}
                        <div
                          className={cn(
                            "absolute inset-x-0 h-2 rounded-full top-1/2 -translate-y-1/2",
                            isFullscreen ? "bg-white/30" : "bg-muted"
                          )}
                        />
                        {/* 音量条填充 */}
                        <div
                          className="absolute h-2 rounded-full bg-primary top-1/2 -translate-y-1/2 transition-all duration-100"
                          style={{
                            width: `${(isMuted ? 0 : volume) * 100}%`,
                          }}
                        />
                        {/* 音量滑块输入 */}
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.1}
                          value={isMuted ? 0 : volume}
                          onChange={(e) =>
                            adjustVolumeValue(Number(e.target.value))
                          }
                          className={cn(
                            "relative z-10 w-full h-4 rounded-lg appearance-none bg-transparent cursor-pointer",
                            // Webkit样式 - 隐藏默认轨道，只保留拖拽手柄
                            "[&::-webkit-slider-track]:appearance-none [&::-webkit-slider-track]:bg-transparent",
                            "[&::-webkit-slider-track]:h-4 [&::-webkit-slider-track]:rounded-lg [&::-webkit-slider-track]:border-none",
                            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3",
                            "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
                            "[&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg",
                            "[&::-webkit-slider-thumb]:border-1 [&::-webkit-slider-thumb]:border-white",
                            "[&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-150",
                            "[&::-webkit-slider-thumb]:hover:scale-110",
                            // Firefox样式
                            "[&::-moz-range-track]:appearance-none [&::-moz-range-track]:bg-transparent",
                            "[&::-moz-range-track]:h-4 [&::-moz-range-track]:rounded-lg [&::-moz-range-track]:border-none",
                            "[&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3",
                            "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary",
                            "[&::-moz-range-thumb]:border-1 [&::-moz-range-thumb]:border-white",
                            "[&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-lg",
                            "[&::-moz-range-thumb]:transition-all [&::-moz-range-thumb]:duration-150"
                          )}
                        />
                      </div>
                    </div>

                    {/* 全屏按钮 */}
                    {mediaFile.mediaType === "video" && (
                      <button
                        onClick={toggleFullscreen}
                        className={cn(
                          "p-2 rounded-md transition-colors",
                          isFullscreen
                            ? "text-white hover:bg-white/10"
                            : "hover:bg-accent"
                        )}
                        title={isFullscreen ? "退出全屏" : "全屏"}
                      >
                        {isFullscreen ? (
                          <Minimize className="w-5 h-5" />
                        ) : (
                          <Maximize className="w-5 h-5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
