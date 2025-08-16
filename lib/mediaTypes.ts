// 支持的媒体类型配置
export const SUPPORTED_MEDIA_TYPES = {
  video: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.webm', '.m4v', '.3gp'],
  audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff']
} as const;

// 媒体类型联合类型
export type MediaType = 'video' | 'audio' | 'image';

/**
 * 检查文件是否为媒体文件
 * @param fileName 文件名
 * @returns 是否为媒体文件
 */
export function isMediaFile(fileName: string): boolean {
  const extension = getFileExtension(fileName);
  return getMediaType(extension) !== null;
}

/**
 * 获取文件的媒体类型
 * @param fileName 文件名
 * @returns 媒体类型或null
 */
export function getMediaType(fileName: string): MediaType | null {
  const extension = getFileExtension(fileName);
  
  if (SUPPORTED_MEDIA_TYPES.video.includes(extension as any)) {
    return 'video';
  }
  
  if (SUPPORTED_MEDIA_TYPES.audio.includes(extension as any)) {
    return 'audio';
  }
  
  if (SUPPORTED_MEDIA_TYPES.image.includes(extension as any)) {
    return 'image';
  }
  
  return null;
}

/**
 * 获取文件扩展名（小写）
 * @param fileName 文件名
 * @returns 文件扩展名
 */
export function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) return '';
  return fileName.substring(lastDotIndex).toLowerCase();
}

/**
 * 获取媒体类型的中文显示名称
 * @param mediaType 媒体类型
 * @returns 中文显示名称
 */
export function getMediaTypeDisplayName(mediaType: MediaType): string {
  const displayNames = {
    video: '视频',
    audio: '音频',
    image: '图片'
  };
  return displayNames[mediaType];
}

/**
 * 获取文件大小的友好显示格式
 * @param bytes 字节数
 * @returns 格式化的文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}