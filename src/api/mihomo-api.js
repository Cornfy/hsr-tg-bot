// src/api/mihomo-api.js
const axios = require('axios');
const cache = require('../cache');
const profileStorage = require('../utils/profile-storage');
const logger = require('../utils/logger');

/**
 * 数据适配器：将不同 API 的原始数据清洗为统一格式
 */
const dataAdapter = {
    // Mihomo 系列 (Parsed 格式)
    mihomo: (data) => {
        if (!data.player || !data.characters) return null;
        return data;
    },

    // Enka 系列
    enka: (data) => {
        // Enka 的 HSR 接口返回结构与 Mihomo Parsed 基本一致，
        // 但有时会包裹在 detailInfo 下或字段名略有差异 (参考 miao-plugin)
        const root = data.detailInfo || data;
        if (!root.player && root.playerDetailInfo) {
            // 兼容某些镜像的包装
            return {
                player: root.playerDetailInfo,
                characters: root.avatarDetailList || []
            };
        }
        return (root.player && root.characters) ? root : null;
    }
};

/**
 * 生成空占位数据 (用于 API 完全失效时)
 */
function getPlaceholderData(uid) {
    return {
        player: { 
            uid, 
            nickname: '新玩家 (同步中)', 
            level: '?', 
            space_info: { achievement_count: 0, avatar_count: 0 } 
        },
        characters: [],
        _isFallback: true,
        _isPlaceholder: true
    };
}

/**
 * 获取玩家数据 (优先读缓存，除非 force=true)
 */
async function getPlayerDetail(uid, force = false) {
    // 1. 尝试读缓存
    const memoryCache = await cache.getCache(uid);
    const diskCache = profileStorage.getProfile(uid);
    const latestCache = memoryCache || diskCache;

    if (!force && latestCache) {
        logger.done(`[缓存命中] UID: ${uid} (玩家: ${latestCache.player?.nickname})`);
        return latestCache;
    }

    // 3. 定义 API 节点
    const apiEndpoints = [
        { name: 'Mihomo-Main', url: `https://api.mihomo.me/sr_info_parsed/${uid}?lang=chs`, type: 'mihomo' },
        { name: 'Mihomo-V3', url: `https://v3.mihomo.me/sr_info_parsed/${uid}?lang=chs`, type: 'mihomo' },
        { name: 'HKRPG-Mirror', url: `https://hkrpg.mihomo.me/sr_info_parsed/${uid}?lang=chs`, type: 'mihomo' },
        { name: 'Enka-Network', url: `https://enka.network/api/hsr/uid/${uid}`, type: 'enka' }
    ];

    // --- 策略：前两个节点并发竞赛 (Fast Race) ---
    logger.info(`正在为 UID ${uid} 请求远程数据 (并发竞速模式)...`);
    const fastLane = apiEndpoints.slice(0, 2);
    const fallbackLane = apiEndpoints.slice(2);

    const tryFetch = async (endpoint, timeout = 10000) => {
        const res = await axios.get(endpoint.url, { 
            timeout,
            headers: { 'User-Agent': 'HSR-TG-Bot/1.0', 'Accept-Language': 'zh-CN,zh;q=0.9' }
        });
        const normalized = dataAdapter[endpoint.type](res.data);
        if (!normalized) throw new Error('Data format invalid');
        return { name: endpoint.name, data: normalized };
    };

    try {
        // 同时请求前两个，谁快用谁 (限时 12s)
        const winner = await Promise.any(fastLane.map(ep => tryFetch(ep, 12000)));
        logger.done(`[API 成功] 节点: ${winner.name} (UID: ${uid})`);
        await cache.setCache(uid, winner.data, 86400); 
        return winner.data;
    } catch (e) {
        logger.warn(`并发请求全部失败或超时，尝试备用节点...`);

        // 3. 备用节点顺序重试
        for (const endpoint of fallbackLane) {
            try {
                const result = await tryFetch(endpoint, 15000);
                logger.done(`[API 成功] 备用节点: ${result.name} (UID: ${uid})`);
                await cache.setCache(uid, result.data, 86400); 
                return result.data;
            } catch (err) {
                logger.warn(`备用节点 ${endpoint.name} 亦失败: ${err.message}`);
            }
        }
    }

    // 4. 最终兜底
    if (latestCache) {
        logger.warn(`所有 API 失效，回退至本地缓存 (UID: ${uid})`);
        latestCache._isFallback = true;
        return latestCache;
    }

    logger.error(`无法获取 UID ${uid} 的任何数据`);
    return getPlaceholderData(uid);
}

module.exports = { getPlayerDetail, getPlaceholderData };
