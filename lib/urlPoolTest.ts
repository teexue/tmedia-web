/**
 * URL池管理测试脚本
 * 用于验证blob URL重用和引用计数机制是否正常工作
 */

import { urlPoolManager } from './urlPool';
import { MediaFile } from './types';

// 模拟测试
export async function testURLPoolManager() {
  console.log('🧪 开始URL池管理测试...');
  
  // 创建模拟文件
  const mockFile = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
  const mockMediaFile: MediaFile = {
    name: 'test.jpg',
    type: 'file',
    handle: {} as FileSystemFileHandle,
    path: '/test/test.jpg',
    size: mockFile.size,
    lastModified: new Date(),
    mediaType: 'image',
    extension: 'jpg'
  };

  console.log('📊 初始池状态:', urlPoolManager.getPoolStatus());

  // 测试1: 获取URL
  console.log('\n🔍 测试1: 首次获取URL');
  const urlInfo1 = await urlPoolManager.acquireURL(mockMediaFile, mockFile);
  console.log('获取的URL:', urlInfo1.url);
  console.log('池状态:', urlPoolManager.getPoolStatus());

  // 测试2: 重复获取相同文件的URL
  console.log('\n🔍 测试2: 重复获取相同文件URL');
  const urlInfo2 = await urlPoolManager.acquireURL(mockMediaFile, mockFile);
  console.log('获取的URL:', urlInfo2.url);
  console.log('URL是否相同:', urlInfo1.url === urlInfo2.url);
  console.log('池状态:', urlPoolManager.getPoolStatus());

  // 测试3: 释放一个引用
  console.log('\n🔍 测试3: 释放一个引用');
  urlInfo1.release();
  console.log('池状态:', urlPoolManager.getPoolStatus());

  // 测试4: 释放另一个引用
  console.log('\n🔍 测试4: 释放另一个引用');
  urlInfo2.release();
  console.log('池状态:', urlPoolManager.getPoolStatus());

  // 测试5: 等待自动清理
  console.log('\n🔍 测试5: 等待自动清理（31秒后）');
  setTimeout(() => {
    console.log('31秒后池状态:', urlPoolManager.getPoolStatus());
  }, 31000);

  console.log('✅ URL池管理测试完成');
}

// 在浏览器控制台中运行测试
if (typeof window !== 'undefined') {
  (window as any).testURLPool = testURLPoolManager;
  console.log('🎯 测试函数已挂载到 window.testURLPool，请在控制台运行 testURLPool() 进行测试');
}
