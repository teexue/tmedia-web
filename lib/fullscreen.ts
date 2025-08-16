/**
 * 全屏显示服务
 * 实现媒体内容的全屏显示优化，包括按比例缩放和居中显示
 */

export interface FullscreenDisplayOptions {
  /** 显示模式 */
  mode: "fit" | "fill" | "original";
  /** 是否保持宽高比 */
  maintainAspectRatio: boolean;
  /** 背景颜色 */
  backgroundColor: string;
}

export interface MediaDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

export interface ViewportDimensions {
  width: number;
  height: number;
}

export interface ScaledDimensions {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * 全屏显示服务类
 * 负责计算媒体内容在全屏模式下的最佳显示尺寸和位置
 */
export class FullscreenService {
  private static instance: FullscreenService;

  private constructor() {}

  /**
   * 获取全屏服务单例实例
   */
  public static getInstance(): FullscreenService {
    if (!FullscreenService.instance) {
      FullscreenService.instance = new FullscreenService();
    }
    return FullscreenService.instance;
  }

  /**
   * 获取当前视口尺寸
   */
  public getViewportDimensions(): ViewportDimensions {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  /**
   * 获取媒体元素的原始尺寸
   */
  public getMediaDimensions(
    element: HTMLImageElement | HTMLVideoElement
  ): MediaDimensions {
    let width: number;
    let height: number;

    if (element instanceof HTMLImageElement) {
      width = element.naturalWidth || element.width;
      height = element.naturalHeight || element.height;
    } else if (element instanceof HTMLVideoElement) {
      width = element.videoWidth || element.width;
      height = element.videoHeight || element.height;
    } else {
      throw new Error("不支持的媒体元素类型");
    }

    return {
      width,
      height,
      aspectRatio: width / height,
    };
  }

  /**
   * 计算以最长边为基准的缩放尺寸
   * 确保媒体内容完全适应屏幕，同时保持宽高比
   */
  public calculateFitToScreen(
    mediaDimensions: MediaDimensions,
    viewportDimensions: ViewportDimensions
  ): ScaledDimensions {
    const {
      width: mediaWidth,
      height: mediaHeight,
      aspectRatio,
    } = mediaDimensions;
    const { width: viewportWidth, height: viewportHeight } = viewportDimensions;

    // 计算视口的宽高比
    const viewportAspectRatio = viewportWidth / viewportHeight;

    let scaledWidth: number;
    let scaledHeight: number;
    let scale: number;

    if (aspectRatio > viewportAspectRatio) {
      // 媒体更宽，以宽度为基准缩放
      scaledWidth = viewportWidth;
      scaledHeight = viewportWidth / aspectRatio;
      scale = viewportWidth / mediaWidth;
    } else {
      // 媒体更高，以高度为基准缩放
      scaledHeight = viewportHeight;
      scaledWidth = viewportHeight * aspectRatio;
      scale = viewportHeight / mediaHeight;
    }

    // 计算居中偏移
    const offsetX = (viewportWidth - scaledWidth) / 2;
    const offsetY = (viewportHeight - scaledHeight) / 2;

    return {
      width: scaledWidth,
      height: scaledHeight,
      scale,
      offsetX,
      offsetY,
    };
  }

  /**
   * 计算填充屏幕的缩放尺寸
   * 媒体内容填满整个屏幕，可能会裁剪部分内容
   */
  public calculateFillScreen(
    mediaDimensions: MediaDimensions,
    viewportDimensions: ViewportDimensions
  ): ScaledDimensions {
    const {
      width: mediaWidth,
      height: mediaHeight,
      aspectRatio,
    } = mediaDimensions;
    const { width: viewportWidth, height: viewportHeight } = viewportDimensions;

    // 计算视口的宽高比
    const viewportAspectRatio = viewportWidth / viewportHeight;

    let scaledWidth: number;
    let scaledHeight: number;
    let scale: number;

    if (aspectRatio > viewportAspectRatio) {
      // 媒体更宽，以高度为基准缩放
      scaledHeight = viewportHeight;
      scaledWidth = viewportHeight * aspectRatio;
      scale = viewportHeight / mediaHeight;
    } else {
      // 媒体更高，以宽度为基准缩放
      scaledWidth = viewportWidth;
      scaledHeight = viewportWidth / aspectRatio;
      scale = viewportWidth / mediaWidth;
    }

    // 计算居中偏移
    const offsetX = (viewportWidth - scaledWidth) / 2;
    const offsetY = (viewportHeight - scaledHeight) / 2;

    return {
      width: scaledWidth,
      height: scaledHeight,
      scale,
      offsetX,
      offsetY,
    };
  }

  /**
   * 计算原始尺寸显示
   * 如果媒体小于屏幕则居中显示，如果大于屏幕则缩放适应
   */
  public calculateOriginalSize(
    mediaDimensions: MediaDimensions,
    viewportDimensions: ViewportDimensions
  ): ScaledDimensions {
    const { width: mediaWidth, height: mediaHeight } = mediaDimensions;
    const { width: viewportWidth, height: viewportHeight } = viewportDimensions;

    let scaledWidth = mediaWidth;
    let scaledHeight = mediaHeight;
    let scale = 1;

    // 如果媒体尺寸超过视口，则缩放适应
    if (mediaWidth > viewportWidth || mediaHeight > viewportHeight) {
      const fitResult = this.calculateFitToScreen(
        mediaDimensions,
        viewportDimensions
      );
      scaledWidth = fitResult.width;
      scaledHeight = fitResult.height;
      scale = fitResult.scale;
    }

    // 计算居中偏移
    const offsetX = (viewportWidth - scaledWidth) / 2;
    const offsetY = (viewportHeight - scaledHeight) / 2;

    return {
      width: scaledWidth,
      height: scaledHeight,
      scale,
      offsetX,
      offsetY,
    };
  }

  /**
   * 根据显示模式计算缩放尺寸
   */
  public calculateScaledDimensions(
    mediaDimensions: MediaDimensions,
    viewportDimensions: ViewportDimensions,
    mode: "fit" | "fill" | "original" = "fit"
  ): ScaledDimensions {
    switch (mode) {
      case "fit":
        return this.calculateFitToScreen(mediaDimensions, viewportDimensions);
      case "fill":
        return this.calculateFillScreen(mediaDimensions, viewportDimensions);
      case "original":
        return this.calculateOriginalSize(mediaDimensions, viewportDimensions);
      default:
        return this.calculateFitToScreen(mediaDimensions, viewportDimensions);
    }
  }

  /**
   * 应用缩放样式到媒体元素
   */
  public applyScaledStyles(
    element: HTMLElement,
    scaledDimensions: ScaledDimensions,
    options: Partial<FullscreenDisplayOptions> = {}
  ): () => void {
    const {
      mode = "fit",
      maintainAspectRatio = true,
      backgroundColor = "#000000",
    } = options;

    const { width, height } = scaledDimensions;

    // 保存原始样式
    const originalStyles = {
      width: element.style.width,
      height: element.style.height,
      position: element.style.position,
      left: element.style.left,
      top: element.style.top,
      objectFit: element.style.objectFit,
      backgroundColor: element.style.backgroundColor,
      transform: element.style.transform,
      zIndex: element.style.zIndex,
      maxWidth: element.style.maxWidth,
      maxHeight: element.style.maxHeight,
      margin: element.style.margin,
      alignSelf: element.style.alignSelf,
    };

    // 设置媒体元素的全屏样式 - 确保在flex容器中正确居中
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.position = "static";
    element.style.objectFit = maintainAspectRatio ? "contain" : "fill";
    element.style.backgroundColor = "transparent";
    element.style.zIndex = "auto";
    element.style.maxWidth = `${width}px`;
    element.style.maxHeight = `${height}px`;
    element.style.margin = "auto"; // 确保在flex容器中居中
    element.style.alignSelf = "center"; // 在交叉轴上居中

    // 返回清理函数
    return () => {
      // 恢复原始样式
      element.style.width = originalStyles.width;
      element.style.height = originalStyles.height;
      element.style.position = originalStyles.position;
      element.style.left = originalStyles.left;
      element.style.top = originalStyles.top;
      element.style.objectFit = originalStyles.objectFit;
      element.style.backgroundColor = originalStyles.backgroundColor;
      element.style.transform = originalStyles.transform;
      element.style.zIndex = originalStyles.zIndex;
      element.style.maxWidth = originalStyles.maxWidth;
      element.style.maxHeight = originalStyles.maxHeight;
      element.style.margin = originalStyles.margin;
      element.style.alignSelf = originalStyles.alignSelf;
    };
  }

  /**
   * 网页内全屏状态管理
   */
  private isWebFullscreen: boolean = false;
  private webFullscreenCallbacks: ((isFullscreen: boolean) => void)[] = [];
  private currentFullscreenElement: HTMLElement | null = null;

  /**
   * 进入网页内全屏模式
   */
  public async enterFullscreen(element: HTMLElement): Promise<boolean> {
    try {
      // 记录当前全屏元素
      this.currentFullscreenElement = element;

      // 设置网页内全屏样式 - 只设置容器样式
      element.style.position = "fixed";
      element.style.top = "0";
      element.style.left = "0";
      element.style.width = "100vw";
      element.style.height = "100vh";
      element.style.zIndex = "9999";
      element.style.backgroundColor = "#000";
      element.style.display = "flex";
      element.style.alignItems = "center";
      element.style.justifyContent = "center";

      // 阻止页面滚动
      document.body.style.overflow = "hidden";

      this.isWebFullscreen = true;
      this.notifyFullscreenChange();

      return true;
    } catch (error) {
      console.warn("进入网页全屏模式失败:", error);
      return false;
    }
  }

  /**
   * 退出网页内全屏模式
   */
  public async exitFullscreen(): Promise<boolean> {
    try {
      // 清除当前全屏元素的内联样式
      if (this.currentFullscreenElement) {
        this.currentFullscreenElement.style.position = "";
        this.currentFullscreenElement.style.top = "";
        this.currentFullscreenElement.style.left = "";
        this.currentFullscreenElement.style.width = "";
        this.currentFullscreenElement.style.height = "";
        this.currentFullscreenElement.style.zIndex = "";
        this.currentFullscreenElement.style.backgroundColor = "";
        this.currentFullscreenElement.style.display = "";
        this.currentFullscreenElement.style.alignItems = "";
        this.currentFullscreenElement.style.justifyContent = "";

        // 清除引用
        this.currentFullscreenElement = null;
      }

      // 恢复页面滚动
      document.body.style.overflow = "";

      this.isWebFullscreen = false;
      this.notifyFullscreenChange();

      return true;
    } catch (error) {
      console.warn("退出网页全屏模式失败:", error);
      return false;
    }
  }

  /**
   * 检查是否处于网页内全屏模式
   */
  public isFullscreen(): boolean {
    return this.isWebFullscreen;
  }

  /**
   * 切换网页内全屏模式
   */
  public async toggleFullscreen(element: HTMLElement): Promise<boolean> {
    if (this.isFullscreen()) {
      return await this.exitFullscreen();
    } else {
      return await this.enterFullscreen(element);
    }
  }

  /**
   * 通知全屏状态变化
   */
  private notifyFullscreenChange(): void {
    this.webFullscreenCallbacks.forEach((callback) => {
      try {
        callback(this.isWebFullscreen);
      } catch (error) {
        console.warn("全屏状态回调执行失败:", error);
      }
    });
  }

  /**
   * 监听网页内全屏状态变化
   */
  public onFullscreenChange(
    callback: (isFullscreen: boolean) => void
  ): () => void {
    this.webFullscreenCallbacks.push(callback);

    // 返回清理函数
    return () => {
      const index = this.webFullscreenCallbacks.indexOf(callback);
      if (index > -1) {
        this.webFullscreenCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 监听视口尺寸变化
   */
  public onViewportResize(
    callback: (dimensions: ViewportDimensions) => void
  ): () => void {
    const handleResize = () => {
      callback(this.getViewportDimensions());
    };

    window.addEventListener("resize", handleResize);

    // 返回清理函数
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }

  /**
   * 为媒体元素设置全屏显示优化
   */
  public optimizeForFullscreen(
    mediaElement: HTMLImageElement | HTMLVideoElement,
    containerElement: HTMLElement,
    options: Partial<FullscreenDisplayOptions> = {}
  ): () => void {
    let styleCleanup: (() => void) | null = null;

    const updateDisplay = () => {
      try {
        // 只在全屏模式下应用样式
        if (!this.isFullscreen()) {
          if (styleCleanup) {
            styleCleanup();
            styleCleanup = null;
          }
          return;
        }

        const mediaDimensions = this.getMediaDimensions(mediaElement);
        const viewportDimensions = this.getViewportDimensions();
        const scaledDimensions = this.calculateScaledDimensions(
          mediaDimensions,
          viewportDimensions,
          options.mode || "fit"
        );

        // 清理之前的样式
        if (styleCleanup) {
          styleCleanup();
        }

        // 应用新样式
        styleCleanup = this.applyScaledStyles(
          mediaElement,
          scaledDimensions,
          options
        );
      } catch (error) {
        console.warn("更新全屏显示失败:", error);
      }
    };

    // 初始设置
    updateDisplay();

    // 监听变化
    const cleanupFullscreen = this.onFullscreenChange(updateDisplay);
    const cleanupResize = this.onViewportResize(updateDisplay);

    // 对于视频，监听元数据加载
    if (mediaElement instanceof HTMLVideoElement) {
      const handleLoadedMetadata = () => updateDisplay();
      mediaElement.addEventListener("loadedmetadata", handleLoadedMetadata);

      return () => {
        if (styleCleanup) {
          styleCleanup();
        }
        cleanupFullscreen();
        cleanupResize();
        mediaElement.removeEventListener(
          "loadedmetadata",
          handleLoadedMetadata
        );
      };
    }

    // 对于图片，监听加载完成
    if (mediaElement instanceof HTMLImageElement) {
      const handleLoad = () => updateDisplay();
      mediaElement.addEventListener("load", handleLoad);

      return () => {
        if (styleCleanup) {
          styleCleanup();
        }
        cleanupFullscreen();
        cleanupResize();
        mediaElement.removeEventListener("load", handleLoad);
      };
    }

    return () => {
      if (styleCleanup) {
        styleCleanup();
      }
      cleanupFullscreen();
      cleanupResize();
    };
  }
}

/**
 * 默认的全屏服务实例
 */
export const fullscreenService = FullscreenService.getInstance();

/**
 * 工具函数：快速计算适应屏幕的尺寸
 */
export function calculateFitToScreen(
  mediaWidth: number,
  mediaHeight: number,
  viewportWidth: number = window.innerWidth,
  viewportHeight: number = window.innerHeight
): ScaledDimensions {
  const service = FullscreenService.getInstance();
  const mediaDimensions: MediaDimensions = {
    width: mediaWidth,
    height: mediaHeight,
    aspectRatio: mediaWidth / mediaHeight,
  };
  const viewportDimensions: ViewportDimensions = {
    width: viewportWidth,
    height: viewportHeight,
  };

  return service.calculateFitToScreen(mediaDimensions, viewportDimensions);
}

/**
 * 工具函数：快速设置媒体元素的全屏优化
 */
export function setupFullscreenOptimization(
  mediaElement: HTMLImageElement | HTMLVideoElement,
  containerElement: HTMLElement,
  options?: Partial<FullscreenDisplayOptions>
): () => void {
  const service = FullscreenService.getInstance();
  return service.optimizeForFullscreen(mediaElement, containerElement, options);
}
