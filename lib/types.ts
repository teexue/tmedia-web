// 文件系统项目接口
export interface FileSystemItem {
  name: string;
  type: 'directory' | 'file';
  handle: FileSystemHandle;
  path: string;
  size?: number;
  lastModified?: Date;
}

// 媒体文件接口
export interface MediaFile extends FileSystemItem {
  mediaType: 'video' | 'audio' | 'image';
  extension: string;
  thumbnail?: string;
  index?: number; // 在当前目录中的索引位置
}

// 目录内容接口
export interface DirectoryContent {
  directories: FileSystemItem[];
  mediaFiles: MediaFile[];
  currentPath: string;
}

// 应用状态管理接口
export interface AppState {
  rootDirectory: FileSystemDirectoryHandle | null;
  currentDirectory: FileSystemDirectoryHandle | null;
  currentPath: string[];
  directoryContent: DirectoryContent | null;
  selectedMedia: MediaFile | null;
  isPlaying: boolean;
  loading: boolean;
}

// 文件系统服务接口
export interface FileSystemService {
  selectDirectory(): Promise<FileSystemDirectoryHandle>;
  readDirectory(handle: FileSystemDirectoryHandle): Promise<DirectoryContent>;
  isMediaFile(fileName: string): boolean;
  getMediaType(fileName: string): 'video' | 'audio' | 'image' | null;
}

// 媒体播放服务接口
export interface MediaPlayerService {
  playMedia(file: MediaFile): Promise<void>;
  pauseMedia(): void;
  stopMedia(): void;
  setVolume(volume: number): void;
}

// 媒体导航状态接口
export interface MediaNavigationState {
  currentMedia: MediaFile | null;
  mediaList: MediaFile[];
  currentIndex: number;
  canGoNext: boolean;
  canGoPrevious: boolean;
}

// 媒体导航服务接口
export interface MediaNavigationService {
  setMediaList(mediaList: MediaFile[]): void;
  setCurrentMedia(media: MediaFile): void;
  setCurrentIndex(index: number): void;
  goToNext(): MediaFile | null;
  goToPrevious(): MediaFile | null;
  getCurrentMedia(): MediaFile | null;
  getCurrentIndex(): number;
  canGoNext(): boolean;
  canGoPrevious(): boolean;
  getMediaList(): MediaFile[];
  getNavigationState(): MediaNavigationState;
}

// 媒体导航事件接口
export interface MediaNavigationEvents {
  onMediaChange?: (media: MediaFile, index: number) => void;
  onNavigationStateChange?: (state: MediaNavigationState) => void;
}