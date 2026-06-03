const fs = require('fs');
const path = require('path');
const logger = require('./logger');

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
 * 保存并合并抽卡记录
 */
function saveAndMergeGacha(uid, newLogs, gameCode = 'HSR') {
    const filePath = getStoragePath(gameCode, 'gacha', uid);
    let localLogs = [];

    if (fs.existsSync(filePath)) {
        try {
            localLogs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {
            localLogs = [];
        }
    }

    // 2. 合并并根据记录 ID 去重
    const combined = [...newLogs, ...localLogs];
    const uniqueMap = new Map();
    combined.forEach(item => {
        if (item.id) uniqueMap.set(item.id, item);
    });

    const finalLogs = Array.from(uniqueMap.values())
        .sort((a, b) => new Date(b.time) - new Date(a.time));

    fs.writeFileSync(filePath, JSON.stringify(finalLogs, null, 2));
    return finalLogs;
}

/**
 * 读取本地存储的所有记录
 */
function getLocalGacha(uid, gameCode = 'HSR') {
    const filePath = getStoragePath(gameCode, 'gacha', uid);
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return null;
}

module.exports = { saveAndMergeGacha, getLocalGacha };
