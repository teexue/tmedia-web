import { useEffect } from 'react';

/**
 * 键盘快捷键配置
 */
export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  action: () => void;
  description: string;
}

/**
 * 使用键盘快捷键的 Hook
 * @param shortcuts 快捷键配置数组
 * @param enabled 是否启用快捷键
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 如果焦点在输入框中，不处理快捷键
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return;
      }

      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = !!shortcut.ctrlKey === event.ctrlKey;
        const altMatch = !!shortcut.altKey === event.altKey;
        const shiftMatch = !!shortcut.shiftKey === event.shiftKey;

        if (keyMatch && ctrlMatch && altMatch && shiftMatch) {
          event.preventDefault();
          shortcut.action();
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, enabled]);
}

/**
 * 媒体播放器快捷键
 */
export const createMediaPlayerShortcuts = (
  isPlaying: boolean,
  onTogglePlay: () => void,
  onVolumeUp: () => void,
  onVolumeDown: () => void,
  onSeekForward: () => void,
  onSeekBackward: () => void,
  onToggleFullscreen?: () => void,
  onClose?: () => void
): KeyboardShortcut[] => [
  {
    key: ' ',
    action: onTogglePlay,
    description: '播放/暂停'
  },
  {
    key: 'ArrowUp',
    action: onVolumeUp,
    description: '音量增加'
  },
  {
    key: 'ArrowDown',
    action: onVolumeDown,
    description: '音量减少'
  },
  {
    key: 'ArrowRight',
    action: onSeekForward,
    description: '快进 10 秒'
  },
  {
    key: 'ArrowLeft',
    action: onSeekBackward,
    description: '快退 10 秒'
  },
  ...(onToggleFullscreen ? [{
    key: 'f',
    action: onToggleFullscreen,
    description: '全屏切换'
  }] : []),
  ...(onClose ? [{
    key: 'Escape',
    action: onClose,
    description: '关闭播放器'
  }] : [])
];

/**
 * 文件浏览器快捷键
 */
export const createFileExplorerShortcuts = (
  onRefresh: () => void,
  onGoBack?: () => void,
  onSearch?: () => void
): KeyboardShortcut[] => [
  {
    key: 'F5',
    action: onRefresh,
    description: '刷新当前目录'
  },
  {
    key: 'r',
    ctrlKey: true,
    action: onRefresh,
    description: '刷新当前目录'
  },
  ...(onGoBack ? [{
    key: 'Backspace',
    action: onGoBack,
    description: '返回上级目录'
  }] : []),
  ...(onSearch ? [{
    key: 'f',
    ctrlKey: true,
    action: onSearch,
    description: '搜索文件'
  }] : [])
];

/**
 * 格式化快捷键显示文本
 * @param shortcut 快捷键配置
 * @returns 格式化的快捷键文本
 */
export function formatShortcutKey(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  
  if (shortcut.ctrlKey) parts.push('Ctrl');
  if (shortcut.altKey) parts.push('Alt');
  if (shortcut.shiftKey) parts.push('Shift');
  
  let key = shortcut.key;
  if (key === ' ') key = 'Space';
  if (key === 'Escape') key = 'Esc';
  
  parts.push(key);
  
  return parts.join(' + ');
}