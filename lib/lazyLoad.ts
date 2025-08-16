/**
 * 懒加载和性能优化工具
 */

/**
 * 创建 Intersection Observer 用于懒加载
 * @param callback 当元素进入视口时的回调
 * @param options Intersection Observer 选项
 * @returns Observer 实例
 */
export function createLazyLoadObserver(
  callback: (entries: IntersectionObserverEntry[]) => void,
  options: IntersectionObserverInit = {}
): IntersectionObserver {
  const defaultOptions: IntersectionObserverInit = {
    root: null,
    rootMargin: '50px', // 提前50px开始加载
    threshold: 0.1,
    ...options
  };

  return new IntersectionObserver(callback, defaultOptions);
}

/**
 * 防抖函数，用于优化频繁的操作
 * @param func 要防抖的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/**
 * 节流函数，用于限制函数执行频率
 * @param func 要节流的函数
 * @param limit 时间限制（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 批量处理队列
 */
export class BatchProcessor<T> {
  private queue: T[] = [];
  private processing = false;
  private batchSize: number;
  private delay: number;
  private processor: (items: T[]) => Promise<void>;

  constructor(
    processor: (items: T[]) => Promise<void>,
    batchSize = 10,
    delay = 100
  ) {
    this.processor = processor;
    this.batchSize = batchSize;
    this.delay = delay;
  }

  add(item: T) {
    this.queue.push(item);
    this.scheduleProcess();
  }

  private scheduleProcess() {
    if (this.processing) return;

    setTimeout(() => {
      this.process();
    }, this.delay);
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.batchSize);
        await this.processor(batch);
        
        // 给浏览器一些时间处理其他任务
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } catch (error) {
      console.error('批量处理出错:', error);
    } finally {
      this.processing = false;
    }
  }
}

/**
 * 优先级队列，用于管理缩略图生成优先级
 */
export class PriorityQueue<T> {
  private items: Array<{ item: T; priority: number }> = [];

  enqueue(item: T, priority: number) {
    const queueItem = { item, priority };
    let added = false;

    for (let i = 0; i < this.items.length; i++) {
      if (queueItem.priority > this.items[i].priority) {
        this.items.splice(i, 0, queueItem);
        added = true;
        break;
      }
    }

    if (!added) {
      this.items.push(queueItem);
    }
  }

  dequeue(): T | undefined {
    const item = this.items.shift();
    return item?.item;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }
}

/**
 * 内存使用监控
 */
export class MemoryMonitor {
  private maxMemoryUsage: number;
  private checkInterval: number;
  private onMemoryWarning?: () => void;

  constructor(maxMemoryMB = 100, checkIntervalMs = 5000) {
    this.maxMemoryUsage = maxMemoryMB * 1024 * 1024; // 转换为字节
    this.checkInterval = checkIntervalMs;
  }

  start(onMemoryWarning?: () => void) {
    this.onMemoryWarning = onMemoryWarning;
    
    if ('memory' in performance) {
      setInterval(() => {
        const memInfo = (performance as any).memory;
        if (memInfo.usedJSHeapSize > this.maxMemoryUsage) {
          console.warn('内存使用过高:', memInfo.usedJSHeapSize / 1024 / 1024, 'MB');
          this.onMemoryWarning?.();
        }
      }, this.checkInterval);
    }
  }
}