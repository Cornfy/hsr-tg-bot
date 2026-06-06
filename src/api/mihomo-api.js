// src/api/mihomo-api.js
/**
 * Mihomo 玩家数据接口模块
 * 负责从多个远程 API (Mihomo, Enka) 获取玩家详情数据，包含缓存逻辑、竞速请求机制及数据标准化适配
 */
const axios = require('axios');
const cache = require('../cache');
const profileStorage = require('../utils/profile-storage');
const logger = require('../utils/logger');
const path = require('path');
const { loadModule } = require('../utils/loader');

const settings = loadModule(path.join(process.cwd(), 'config/app-settings.js'));
const PROFILE_TTL = settings.COMMON.CACHE_EXPIRY.PROFILE;

/**
 * 数据适配器：将不同 API 源返回的原始数据清洗为应用统一格式
 * @type {Object}
 */
const dataAdapter = {
    // Mihomo 系列接口 (Parsed 格式，结构最为规范)
    mihomo: (data) => {
        if (!data.player || !data.characters) return null;
        return data;
    },

    // Enka 系列接口
    enka: (data) => {
        // Enka 返回结构可能略有不同，需兼容处理
        const root = data.detailInfo || data;
        if (!root.player && root.playerDetailInfo) {
            // 兼容某些镜像包装的结构
            return {
                player: root.playerDetailInfo,
                characters: root.avatarDetailList || []
            };
        }
        return (root.player && root.characters) ? root : null;
    }
};

/**
 * 获取空占位数据 (用于 API 完全失效且无本地缓存时的兜底处理)
 * @param {string|number} uid - 用户UID
 * @returns {Object} 包含默认占位结构的数据对象
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
 * 获取玩家详情数据
 * 策略：缓存优先 -> 并发请求主要节点 -> 顺序请求备用节点 -> 本地缓存回退 -> 空数据占位
 * @param {string|number} uid - 用户UID
 * @param {boolean} [force=false] - 是否强制跳过缓存直接重新获取
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {Promise<Object>} 玩家数据对象
 */
async function getPlayerDetail(uid, force = false, gameCode = 'HSR') {
    // 1. 尝试读缓存 (内存缓存优先，其次读磁盘存储)
    const memoryCache = await cache.getCache(uid, gameCode);
    const diskCache = profileStorage.getProfile(uid, gameCode);
    const latestCache = memoryCache || diskCache;

    // 若缓存命中且非强制更新，直接返回
    if (!force && latestCache && !latestCache._isPlaceholder) {
        logger.done(`[缓存命中] UID: ${uid} (玩家: ${latestCache.player?.nickname})`);
        return latestCache;
    }

    // 2. 定义 API 请求节点配置
    const apiEndpoints = [
        { name: 'Mihomo-Main', url: `https://api.mihomo.me/sr_info_parsed/${uid}?lang=chs`, type: 'mihomo' },
        { name: 'Mihomo-V3', url: `https://v3.mihomo.me/sr_info_parsed/${uid}?lang=chs`, type: 'mihomo' },
        { name: 'Enka-Network', url: `https://enka.network/api/hsr/uid/${uid}`, type: 'enka' }
    ];

    // --- 策略：并发竞速请求主要节点 (提升响应速度) ---
    logger.info(`正在为 UID ${uid} 请求远程数据 (并发竞速模式, force=${force})...`);
    
    // 设置动态超时：强制刷新或本地无有效缓存时使用20s应对冷启动
    const timeout = force || !latestCache ? 20000 : 10000;

    /**
     * 辅助函数：执行单次请求并标准化结果
     */
    const tryFetch = async (endpoint, timeout) => {
        const res = await axios.get(endpoint.url, { 
            timeout,
            headers: { 'User-Agent': 'HSR-TG-Bot/1.0', 'Accept-Language': 'zh-CN,zh;q=0.9' }
        });
        const normalized = dataAdapter[endpoint.type](res.data);
        if (!normalized) throw new Error('Data format invalid');
        return { name: endpoint.name, data: normalized };
    };

    // 执行并发请求的包装函数
    const runRace = async () => {
        const fastLane = apiEndpoints.slice(0, 3); // Mihomo 主/V3 + Enka
        return await Promise.any(fastLane.map(ep => tryFetch(ep, timeout)));
    };

    try {
        let winner;
        try {
            // 策略：优先尝试获取热缓存
            winner = await runRace();
        } catch (e) {
            // 💡 首次竞速失败通常意味着上游冷启动，将错误降级为警告，并执行带缓冲的二次重试
            logger.warn(`[冷启动探测] UID ${uid} 首次请求未命中热缓存，正在执行穿透重试...`);
            
            // ⏱️ 故意延迟 1.5 秒再发起重试，给上游服务器留足“后台下载并写入缓存”的呼吸时间
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            winner = await runRace();
        }

        logger.done(`[API 成功] 节点: ${winner.name} (UID: ${uid})`);
        
        // 校验数据有效性，若为非法则抛出错误
        if (!winner.data || winner.data._isPlaceholder || !winner.data.player?.nickname) {
            throw new Error('Received invalid data from API');
        }

        await cache.setCache(uid, winner.data, PROFILE_TTL, gameCode); 
        return winner.data;
    } catch (e) {
        logger.error(`API 节点竞速与重试均失败 (UID: ${uid}): ${e.message}`);
    }

    // 4. 最终兜底：API 全部失效则使用本地缓存，若无可缓存则返回占位数据
    if (latestCache && !latestCache._isPlaceholder) {
        logger.warn(`所有 API 失效，回退至本地缓存 (UID: ${uid})`);
        latestCache._isFallback = true;
        return latestCache;
    }

    logger.error(`无法获取 UID ${uid} 的任何数据`);
    return getPlaceholderData(uid);
}

module.exports = { getPlayerDetail, getPlaceholderData };
