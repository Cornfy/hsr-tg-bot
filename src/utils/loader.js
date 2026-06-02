// src/utils/loader.js
const path = require('path');
const fs = require('fs');

// 动态加载模块并清除缓存
function loadModule(modulePath) {
    const resolvedPath = path.resolve(modulePath);
    if (require.cache[resolvedPath]) {
        delete require.cache[resolvedPath];
    }
    return require(resolvedPath);
}

module.exports = { loadModule };
