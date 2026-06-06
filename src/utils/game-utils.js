// src/utils/game-utils.js
/**
 * 游戏业务工具模块
 * 提供基于业务标识（game_biz）探测游戏类型、配置映射及启发式游戏检测的功能
 */
const path = require('path');
const { loadModule } = require('./loader');

/**
 * 获取最新的应用配置 (从配置文件加载)
 * @returns {Object} 包含全局配置的对象
 */
const getSettings = () => loadModule(path.join(process.cwd(), 'config/app-settings.js'));

/**
 * 根据给定的业务标识 (game_biz) 探测对应的游戏代码
 * @param {string} biz - 游戏业务标识 (如 'hkrpg_cn')
 * @returns {Object} 包含 { code, method } 的对象 (code: 游戏简码, method: 识别方式)
 */
function getGameCodeFromBiz(biz) {
    if (!biz) return { code: 'HSR', method: 'guessed' };
    const b = String(biz).toLowerCase();
    const settings = getSettings();
    const { BIZ_PREFIXES } = settings.COMMON.GAME_DETECTION;

    // 匹配 biz 前缀以确定游戏代码
    for (const [prefix, code] of Object.entries(BIZ_PREFIXES)) {
        if (b.startsWith(prefix)) return { code, method: 'explicit' };
    }
    
    // 未匹配到则默认返回 HSR 并标记为猜测
    return { code: 'HSR', method: 'guessed' };
}

/**
 * 通过分析数据对象启发式地探测所属游戏
 * @param {Object} data - 抽卡或用户数据对象
 * @returns {Object} 包含 { code, method } 的对象
 */
function detectGameFromData(data) {
    if (!data) return { code: 'HSR', method: 'guessed' };
    
    // 1. 最高优先级：尝试通过明确的 game_biz 标识探测
    const biz = data.info?.game_biz || data.game_biz;
    if (biz) {
        const res = getGameCodeFromBiz(biz);
        if (res.method !== 'guessed') return res;
    }

    // 2. 次高优先级：检查数据对象是否包含游戏特定的特征字段
    const settings = getSettings();
    const { FEATURES } = settings.COMMON.GAME_DETECTION;
    
    const scores = {};
    for (const [code, fields] of Object.entries(FEATURES)) {
        // 如果数据包含配置定义中的特征字段，则记录得分
        scores[code] = fields.some(f => data[f] !== undefined);
    }

    const detected = Object.entries(scores).filter(([_, hit]) => hit);
    if (detected.length === 1) {
        return { code: detected[0][0], method: 'heuristic' };
    }

    // 3. 兜底处理
    return { code: 'HSR', method: 'guessed' };
}

/**
 * 根据游戏代码获取默认的业务标识 (biz)
 * @param {string} gameCode - 游戏代码 (如 'HSR')
 * @returns {string} 默认的业务标识
 */
function getDefaultBiz(gameCode) {
    const settings = getSettings();
    const { DEFAULT_BIZ } = settings.COMMON.GAME_DETECTION;
    return DEFAULT_BIZ[gameCode] || DEFAULT_BIZ['HSR'];
}

module.exports = {
    getGameCodeFromBiz,
    detectGameFromData,
    getDefaultBiz
};
