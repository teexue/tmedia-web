/**
 * URL调试工具
 * 用于诊断blob URL访问失败的问题
 */

import { urlPoolManager } from './urlPool';

class URLDebugger {
  private originalCreateObjectURL: typeof URL.createObjectURL;
  private originalRevokeObjectURL: typeof URL.revokeObjectURL;
  private urlRegistry = new Map<string, { 
    created: number; 
    revoked: boolean; 
    stack: string;
    name?: string;
  }>();

  constructor() {
    this.originalCreateObjectURL = URL.createObjectURL.bind(URL);
    this.originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
    this.setupInterceptors();
  }

  private setupInterceptors() {
    const self = this;
    
    // 拦截URL创建
    URL.createObjectURL = function(object: File | MediaSource | Blob) {
      const url = self.originalCreateObjectURL(object);
      const stack = new Error().stack || '';
      
      self.urlRegistry.set(url, {
        created: Date.now(),
        revoked: false,
        stack,
        name: object instanceof File ? object.name : 'blob'
      });
      
      console.log(`🆕 创建URL:`, url, object instanceof File ? object.name : 'blob');
      return url;
    };

    // 拦截URL释放
    URL.revokeObjectURL = function(url: string) {
      const entry = self.urlRegistry.get(url);
      if (entry) {
        entry.revoked = true;
        console.log(`🗑️ 释放URL:`, url, entry.name, `存活时间: ${Date.now() - entry.created}ms`);
      } else {
        console.warn(`⚠️ 释放未知URL:`, url);
      }
      
      return self.originalRevokeObjectURL(url);
    };
  }

  /**
   * 检查URL是否仍然有效
   */
  checkURL(url: string): boolean {
    const entry = this.urlRegistry.get(url);
    if (!entry) {
      console.warn(`❓ 未知URL:`, url);
      return false;
    }
    
    if (entry.revoked) {
      console.error(`❌ URL已被释放:`, url, entry.name);
      return false;
    }
    
    console.log(`✅ URL有效:`, url, entry.name, `存活时间: ${Date.now() - entry.created}ms`);
    return true;
  }

  /**
   * 获取所有活跃的URL
   */
  getActiveURLs(): Array<{ url: string; name?: string; age: number }> {
    const active = [];
    for (const [url, entry] of this.urlRegistry.entries()) {
      if (!entry.revoked) {
        active.push({
          url,
          name: entry.name,
          age: Date.now() - entry.created
        });
      }
    }
    return active;
  }

  /**
   * 获取调试报告
   */
  getReport(): {
    totalCreated: number;
    totalRevoked: number;
    active: number;
    poolStatus: any;
  } {
    const total = this.urlRegistry.size;
    const revoked = Array.from(this.urlRegistry.values()).filter(e => e.revoked).length;
    const active = total - revoked;
    
    return {
      totalCreated: total,
      totalRevoked: revoked,
      active,
      poolStatus: urlPoolManager.getPoolStatus()
    };
  }

  /**
   * 清理调试器
   */
  destroy() {
    URL.createObjectURL = this.originalCreateObjectURL;
    URL.revokeObjectURL = this.originalRevokeObjectURL;
    this.urlRegistry.clear();
    console.log('🧹 URL调试器已清理');
  }
}

// 创建全局调试器实例
export const urlDebugger = new URLDebugger();

// 挂载到全局对象用于调试
if (typeof window !== 'undefined') {
  (window as any).urlDebugger = urlDebugger;
  (window as any).checkURL = (url: string) => urlDebugger.checkURL(url);
  (window as any).getURLReport = () => {
    const report = urlDebugger.getReport();
    console.table(report);
    console.log('活跃URLs:', urlDebugger.getActiveURLs());
    return report;
  };
  
  console.log('🔍 URL调试器已激活');
  console.log('使用 getURLReport() 查看URL状态');
  console.log('使用 checkURL(url) 检查特定URL');
}
