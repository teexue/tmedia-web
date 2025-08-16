import { MediaFile, MediaNavigationService, MediaNavigationState, MediaNavigationEvents } from './types';

/**
 * 媒体导航服务实现类
 * 负责管理媒体文件列表的导航逻辑，包括上一张/下一张切换功能
 */
export class MediaNavigationManager implements MediaNavigationService {
  private mediaList: MediaFile[] = [];
  private currentIndex: number = -1;
  private events: MediaNavigationEvents = {};

  constructor(events?: MediaNavigationEvents) {
    this.events = events || {};
  }

  /**
   * 设置媒体文件列表并为每个文件分配索引
   * @param mediaList 媒体文件数组
   */
  setMediaList(mediaList: MediaFile[]): void {
    this.mediaList = mediaList.map((media, index) => ({
      ...media,
      index
    }));
    
    // 如果当前索引超出范围，重置为-1
    if (this.currentIndex >= this.mediaList.length) {
      this.currentIndex = -1;
    }
    
    this.notifyNavigationStateChange();
  }

  /**
   * 设置当前播放的媒体文件
   * @param media 要设置为当前的媒体文件
   */
  setCurrentMedia(media: MediaFile): void {
    const index = this.mediaList.findIndex(m => 
      m.name === media.name && m.path === media.path
    );
    
    if (index !== -1) {
      this.currentIndex = index;
      this.notifyMediaChange(media, index);
      this.notifyNavigationStateChange();
    }
  }

  /**
   * 直接设置当前索引
   * @param index 要设置的索引值
   */
  setCurrentIndex(index: number): void {
    if (index >= 0 && index < this.mediaList.length) {
      this.currentIndex = index;
      const media = this.mediaList[index];
      this.notifyMediaChange(media, index);
      this.notifyNavigationStateChange();
    }
  }

  /**
   * 切换到下一张媒体文件
   * @returns 下一张媒体文件，如果已经是最后一张则返回null
   */
  goToNext(): MediaFile | null {
    if (!this.canGoNext()) {
      return null;
    }

    this.currentIndex++;
    const nextMedia = this.mediaList[this.currentIndex];
    
    this.notifyMediaChange(nextMedia, this.currentIndex);
    this.notifyNavigationStateChange();
    
    return nextMedia;
  }

  /**
   * 切换到上一张媒体文件
   * @returns 上一张媒体文件，如果已经是第一张则返回null
   */
  goToPrevious(): MediaFile | null {
    if (!this.canGoPrevious()) {
      return null;
    }

    this.currentIndex--;
    const previousMedia = this.mediaList[this.currentIndex];
    
    this.notifyMediaChange(previousMedia, this.currentIndex);
    this.notifyNavigationStateChange();
    
    return previousMedia;
  }

  /**
   * 获取当前播放的媒体文件
   * @returns 当前媒体文件或null
   */
  getCurrentMedia(): MediaFile | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.mediaList.length) {
      return this.mediaList[this.currentIndex];
    }
    return null;
  }

  /**
   * 获取当前索引
   * @returns 当前索引值
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * 检查是否可以切换到下一张
   * @returns 如果可以切换到下一张返回true
   */
  canGoNext(): boolean {
    return this.currentIndex >= 0 && 
           this.currentIndex < this.mediaList.length - 1 && 
           this.mediaList.length > 0;
  }

  /**
   * 检查是否可以切换到上一张
   * @returns 如果可以切换到上一张返回true
   */
  canGoPrevious(): boolean {
    return this.currentIndex > 0 && this.mediaList.length > 0;
  }

  /**
   * 获取媒体文件列表
   * @returns 当前的媒体文件列表
   */
  getMediaList(): MediaFile[] {
    return [...this.mediaList];
  }

  /**
   * 获取当前导航状态
   * @returns 包含所有导航状态信息的对象
   */
  getNavigationState(): MediaNavigationState {
    return {
      currentMedia: this.getCurrentMedia(),
      mediaList: this.getMediaList(),
      currentIndex: this.currentIndex,
      canGoNext: this.canGoNext(),
      canGoPrevious: this.canGoPrevious()
    };
  }

  /**
   * 通知媒体变更事件
   * @param media 变更后的媒体文件
   * @param index 变更后的索引
   */
  private notifyMediaChange(media: MediaFile, index: number): void {
    if (this.events.onMediaChange) {
      this.events.onMediaChange(media, index);
    }
  }

  /**
   * 通知导航状态变更事件
   */
  private notifyNavigationStateChange(): void {
    if (this.events.onNavigationStateChange) {
      this.events.onNavigationStateChange(this.getNavigationState());
    }
  }

  /**
   * 更新事件处理器
   * @param events 新的事件处理器配置
   */
  updateEvents(events: MediaNavigationEvents): void {
    this.events = { ...this.events, ...events };
  }

  /**
   * 重置导航状态
   */
  reset(): void {
    this.mediaList = [];
    this.currentIndex = -1;
    this.notifyNavigationStateChange();
  }

  /**
   * 获取媒体列表的统计信息
   * @returns 包含总数、当前位置等信息的对象
   */
  getStatistics(): {
    total: number;
    current: number;
    hasNext: boolean;
    hasPrevious: boolean;
  } {
    return {
      total: this.mediaList.length,
      current: this.currentIndex + 1, // 显示时从1开始计数
      hasNext: this.canGoNext(),
      hasPrevious: this.canGoPrevious()
    };
  }
}

/**
 * 创建媒体导航管理器的工厂函数
 * @param events 可选的事件处理器
 * @returns 新的媒体导航管理器实例
 */
export function createMediaNavigationManager(events?: MediaNavigationEvents): MediaNavigationManager {
  return new MediaNavigationManager(events);
}

/**
 * 默认的媒体导航管理器实例
 * 可以在应用中直接使用，也可以创建新的实例
 */
export const defaultMediaNavigationManager = new MediaNavigationManager();