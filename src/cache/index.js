// src/cache/index.js
const Redis = require('ioredis');
const logger = require('../utils/logger');
require('dotenv').config();

// 创建 Redis/Valkey 实例
const valkey = new Redis(process.env.VALKEY_URL || 'redis://127.0.0.1:6379', {
    enableOfflineQueue: true,
    retryStrategy(times) {
        return Math.min(times * 50, 2000);
    }
});

valkey.on('error', (err) => {
    if (err.code !== 'ECONNREFUSED') {
        logger.error('Valkey 客户端发生错误', err);
    }
});

// --- 业务函数定义 ---

// 绑定 TG 用户 ID 与 HSR UID
const bindUid = async (tgId, uid) => {
    await valkey.set(`hsr:user:${tgId}`, uid);
};

// 获取绑定的 UID
const getBindUid = async (tgId) => {
    return await valkey.get(`hsr:user:${tgId}`);
};

// 缓存 API 返回的原始数据
const setCache = async (uid, data, ttl = 86400) => {
    // 默认缓存 24h
    await valkey.set(`hsr:cache:${uid}`, JSON.stringify(data), 'EX', ttl);
};

// 获取缓存的 API 数据
const getCache = async (uid) => {
    const data = await valkey.get(`hsr:cache:${uid}`);
    return data ? JSON.parse(data) : null;
};

module.exports = { 
    bindUid, 
    getBindUid, 
    setCache, 
    getCache
};
