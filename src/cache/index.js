// src/cache/index.js
/**
 * 缓存管理模块 (Valkey/Redis 适配)
 * 提供基于 Valkey 的缓存服务，用于存储用户与 UID 的绑定关系及 API 数据缓存，提升系统响应速度
 */
const Redis = require('ioredis');
const logger = require('../utils/logger');
require('dotenv').config();

// 创建 Redis/Valkey 连接实例
const valkey = new Redis(process.env.VALKEY_URL || 'redis://127.0.0.1:6379', {
    enableOfflineQueue: true, // 允许在连接未建立时排队指令
    retryStrategy(times) {
        // 重连策略：指数退避，最大间隔 2 秒
        return Math.min(times * 50, 2000);
    }
});

// 连接错误处理
valkey.on('error', (err) => {
    if (err.code !== 'ECONNREFUSED') {
        logger.error('Valkey 客户端发生错误', err);
    }
});

/**
 * 绑定 Telegram 用户 ID 与 UID
 * @param {string|number} tgId - Telegram 用户 ID
 * @param {string|number} uid - 游戏 UID
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {Promise<void>}
 */
const bindUid = async (tgId, uid, gameCode = 'HSR') => {
    const prefix = String(gameCode).toLowerCase();
    await valkey.set(`${prefix}:user:${tgId}`, uid);
};

/**
 * 获取指定 Telegram 用户绑定的 UID
 * @param {string|number} tgId - Telegram 用户 ID
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {Promise<string|null>} 绑定的 UID 或 null
 */
const getBindUid = async (tgId, gameCode = 'HSR') => {
    const prefix = String(gameCode).toLowerCase();
    return await valkey.get(`${prefix}:user:${tgId}`);
};

/**
 * 缓存 API 返回的原始数据
 * @param {string|number} uid - 用户 UID
 * @param {Object} data - 需要缓存的数据对象
 * @param {number} [ttl=86400] - 过期时间 (秒，默认为 24 小时)
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {Promise<void>}
 */
const setCache = async (uid, data, ttl = 86400, gameCode = 'HSR') => {
    const prefix = String(gameCode).toLowerCase();
    await valkey.set(`${prefix}:cache:${uid}`, JSON.stringify(data), 'EX', ttl);
};

/**
 * 获取缓存的 API 数据
 * @param {string|number} uid - 用户 UID
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {Promise<Object|null>} 缓存的数据对象或 null
 */
const getCache = async (uid, gameCode = 'HSR') => {
    const prefix = String(gameCode).toLowerCase();
    const data = await valkey.get(`${prefix}:cache:${uid}`);
    return data ? JSON.parse(data) : null;
};

module.exports = { 
    bindUid, 
    getBindUid, 
    setCache, 
    getCache
};
