const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const moment = require('moment');

const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * 获取存储路径
 * 结构：data/{gameCode}/{type}/{uid}.json
 */
function getStoragePath(gameCode, type, uid) {
    const dir = path.join(DATA_DIR, gameCode, type);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, `${uid}.json`);
}

/**
 * 保存并合并抽卡记录 (标准化 SRGF 风格存储)
 */
function saveAndMergeGacha(uid, newLogs, metadata = {}) {
    const { gameCode = 'HSR', game_biz = 'hkrpg_cn', region = 'prod_gf_cn' } = metadata;
    const filePath = getStoragePath(gameCode, 'gacha', uid);
    
    let localData = { info: {}, list: [] };

    if (fs.existsSync(filePath)) {
        try {
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            // 兼容旧的纯数组格式
            if (Array.isArray(raw)) {
                localData.list = raw;
            } else {
                localData = raw;
            }
        } catch (e) {
            localData = { info: {}, list: [] };
        }
    }

    // 1. 合并并根据记录 ID 去重
    const combined = [...newLogs, ...localData.list];
    const uniqueMap = new Map();
    combined.forEach(item => {
        if (item.id) uniqueMap.set(String(item.id), item);
    });

    const finalLogs = Array.from(uniqueMap.values())
        .sort((a, b) => new Date(b.time) - new Date(a.time));

    // 2. 构造自描述对象 (参考 SRGF)
    const storageObj = {
        info: {
            uid: String(uid),
            game: gameCode,
            game_biz: game_biz,
            region: region,
            export_app: 'hsr-tg-bot',
            export_time: moment().format('YYYY-MM-DD HH:mm:ss'),
            srgf_version: 'v1.0'
        },
        list: finalLogs
    };

    fs.writeFileSync(filePath, JSON.stringify(storageObj, null, 2));
    return finalLogs;
}

/**
 * 读取本地存储的抽卡数据集
 * 返回：{ info, list }
 */
function getLocalGachaData(uid, gameCode = 'HSR') {
    const filePath = getStoragePath(gameCode, 'gacha', uid);
    if (fs.existsSync(filePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (Array.isArray(data)) {
                return { info: { uid }, list: data };
            }
            return data;
        } catch (e) {
            return null;
        }
    }
    return null;
}

/**
 * 快捷获取本地抽卡列表 (用于 Render)
 */
function getLocalGacha(uid, gameCode = 'HSR') {
    const data = getLocalGachaData(uid, gameCode);
    return data ? data.list : null;
}

module.exports = { saveAndMergeGacha, getLocalGacha, getLocalGachaData };
