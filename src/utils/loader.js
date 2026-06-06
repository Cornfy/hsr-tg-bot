// src/utils/loader.js
/**
 * 模块加载工具
 * 提供动态加载模块的能力，支持强制清除缓存以实现热重载
 */
const path = require('path');

/**
 * 加载指定的模块
 * @param {string} modulePath - 模块的路径
 * @param {boolean} [forceReload=false] - 是否强制清除 Node.js 的模块缓存以实现热重载
 * @returns {Object} 加载的模块内容
 */
function loadModule(modulePath, forceReload = false) {
    const resolvedPath = path.resolve(modulePath);
    
    // 若要求强制重载且缓存中存在，则删除缓存
    if (forceReload && require.cache[resolvedPath]) {
        delete require.cache[resolvedPath];
    }
    
    return require(resolvedPath);
}

module.exports = { loadModule };
