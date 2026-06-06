const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { loadModule } = require('./loader');
const { detectGameFromData, getDefaultBiz } = require('./game-utils');

const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * 获取存储路径
 */
function getStoragePath(gameCode, uid) {
    const safeUid = String(uid).replace(/[^0-9]/g, '');
    const dir = path.join(DATA_DIR, gameCode, 'profile');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, `${safeUid}.json`);
}

/**
 * 获取地区标识 (已支持多游戏分组)
 */
function getRegion(uid, gameCode = 'HSR') {
    const settings = loadModule(path.join(process.cwd(), 'config/app-settings.js'));
    const first = String(uid).charAt(0);
    // 优先匹配当前游戏，找不到则尝试 HSR 兜底，再找不到返回 unknown
    const gameMap = settings.COMMON.REGION_MAP[gameCode] || settings.COMMON.REGION_MAP['HSR'];
    return gameMap[first] || 'unknown';
}

/**
 * 保存玩家面板数据
 */
function saveProfile(uid, data, gameCode = null) {
    const { code, method } = detectGameFromData(data);
    const finalGameCode = gameCode || code;
    const filePath = getStoragePath(finalGameCode, uid);
    
    const storageObj = {
        info: {
            uid: String(uid),
            game: finalGameCode,
            game_biz: data.info?.game_biz || data.game_biz || getDefaultBiz(finalGameCode),
            region: getRegion(uid, finalGameCode),
            detection_method: method,
            last_sync: moment().format('YYYY-MM-DD HH:mm:ss')
        },
        data: data
    };
    fs.writeFileSync(filePath, JSON.stringify(storageObj, null, 2));
}

/**
 * 获取本地缓存的面板数据
 */
function getProfile(uid, gameCode = 'HSR') {
    const filePath = getStoragePath(gameCode, uid);
    if (fs.existsSync(filePath)) {
        try {
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (raw.info && raw.data) return raw.data;
            return raw;
        } catch (e) { return null; }
    }
    return null;
}

module.exports = { saveProfile, getProfile };
