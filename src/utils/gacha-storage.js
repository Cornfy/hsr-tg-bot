// src/utils/gacha-storage.js
/**
 * 抽卡数据存储与管理工具
 * 负责抽卡记录的本地文件持久化、数据去重合并及 SRGF 格式化存储
 */
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const moment = require('moment');
const { loadModule } = require('./loader');
const { getGameCodeFromBiz, getDefaultBiz } = require('./game-utils');

// 基础数据存储目录
const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * 构建并获取指定用户抽卡数据的本地存储文件路径
 * @param {string} gameCode - 游戏代码 (如 'HSR')
 * @param {string} type - 数据类型 (如 'gacha')
 * @param {string|number} uid - 用户游戏UID
 * @returns {string} 绝对文件路径
 */
function getStoragePath(gameCode, type, uid) {
    const safeUid = String(uid).replace(/[^0-9]/g, '');
    const dir = path.join(DATA_DIR, gameCode, type);
    // 确保目录存在
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, `${safeUid}.json`);
}

/**
 * 根据 UID 首位获取地区标识
 * @param {string|number} uid - 用户游戏UID
 * @param {string} gameCode - 游戏代码
 * @returns {string} 地区标识 (如 'prod_gf_cn')
 */
function getRegion(uid, gameCode = 'HSR') {
    const settings = loadModule(path.join(process.cwd(), 'config/app-settings.js'));
    const first = String(uid).charAt(0);
    const gameMap = settings.COMMON.REGION_MAP[gameCode] || settings.COMMON.REGION_MAP['HSR'];
    return gameMap[first] || 'unknown';
}

/**
 * 将新的抽卡记录合并到本地存储，并按 ID 去重、时间排序
 * @param {string|number} uid - 用户 UID
 * @param {Array} newLogs - 新获取的抽卡日志数组
 * @param {Object} metadata - 元数据 (游戏biz, 代码, 地区等)
 * @returns {Array} 合并并排序后的最终日志数组
 */
function saveAndMergeGacha(uid, newLogs, metadata = {}) {
    let { game_biz, gameCode, region } = metadata;
    let detectionMethod = 'explicit';
    
    // 如果缺少游戏信息，尝试自动探测
    if (!gameCode || !game_biz) {
        const detection = getGameCodeFromBiz(game_biz);
        gameCode = gameCode || detection.code;
        game_biz = game_biz || getDefaultBiz(gameCode);
        detectionMethod = detection.method;
    }
    
    if (!region) region = getRegion(uid, gameCode);

    const filePath = getStoragePath(gameCode, 'gacha', uid);
    
    let localData = { info: {}, list: [] };

    // 读取现有数据
    if (fs.existsSync(filePath)) {
        try {
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (Array.isArray(raw)) {
                localData.list = raw;
            } else {
                localData = raw;
            }
        } catch (e) {
            // 解析失败则视为空数据
            localData = { info: {}, list: [] };
        }
    }

    // 1. 合并数据，使用 Map 根据记录 ID 去重
    const combined = [...newLogs, ...localData.list];
    const uniqueMap = new Map();
    combined.forEach(item => {
        if (item.id) uniqueMap.set(String(item.id), item);
    });

    // 2. 排序并构造成标准 SRGF 格式
    const finalLogs = Array.from(uniqueMap.values())
        .sort((a, b) => new Date(b.time) - new Date(a.time));

    const storageObj = {
        info: {
            uid: String(uid),
            game: gameCode,
            game_biz: game_biz,
            region: region,
            detection_method: detectionMethod,
            export_app: 'hsr-tg-bot',
            export_time: moment().format('YYYY-MM-DD HH:mm:ss'),
            srgf_version: 'v1.0'
        },
        list: finalLogs
    };

    // 持久化存储
    fs.writeFileSync(filePath, JSON.stringify(storageObj, null, 2));
    return finalLogs;
}

/**
 * 读取本地存储的完整抽卡数据集 (包含 info 和 list)
 * @param {string|number} uid - 用户 UID
 * @param {string} gameCode - 游戏代码
 * @returns {Object|null} 抽卡数据集对象或 null
 */
function getLocalGachaData(uid, gameCode = 'HSR') {
    const filePath = getStoragePath(gameCode, 'gacha', uid);
    if (fs.existsSync(filePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (Array.isArray(data)) return { info: { uid }, list: data };
            return data;
        } catch (e) { return null; }
    }
    return null;
}

/**
 * 获取本地抽卡记录的列表 (仅包含 list 数据)
 * @param {string|number} uid - 用户 UID
 * @param {string} gameCode - 游戏代码
 * @returns {Array|null} 抽卡记录列表或 null
 */
function getLocalGacha(uid, gameCode = 'HSR') {
    const data = getLocalGachaData(uid, gameCode);
    return data ? data.list : null;
}

/**
 * 获取用于导出功能的物理文件路径
 * @param {string|number} uid - 用户 UID
 * @param {string} gameCode - 游戏代码
 * @returns {string} JSON 文件路径
 */
function getExportGachaPath(uid, gameCode = 'HSR') {
    return getStoragePath(gameCode, 'gacha', uid);
}

module.exports = { saveAndMergeGacha, getLocalGacha, getLocalGachaData, getExportGachaPath };
