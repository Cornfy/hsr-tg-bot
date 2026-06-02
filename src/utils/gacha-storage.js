// src/utils/gacha-storage.js
const fs = require('fs');
const path = require('path');

const GACHA_DIR = path.join(process.cwd(), 'data', 'gacha');

// 确保目录存在
if (!fs.existsSync(GACHA_DIR)) {
    fs.mkdirSync(GACHA_DIR, { recursive: true });
}

/**
 * 保存并合并抽卡记录
 */
function saveAndMergeGacha(uid, newLogs) {
    const filePath = path.join(GACHA_DIR, `${uid}.json`);
    let localLogs = [];

    // 1. 如果本地已有记录，先读取
    if (fs.existsSync(filePath)) {
        try {
            localLogs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {
            localLogs = [];
        }
    }

    // 2. 合并并根据记录 ID 去重 (抽卡记录的 id 是唯一的)
    const combined = [...newLogs, ...localLogs];
    const uniqueMap = new Map();
    combined.forEach(item => {
        if (item.id) uniqueMap.set(item.id, item);
    });

    const finalLogs = Array.from(uniqueMap.values())
        .sort((a, b) => new Date(b.time) - new Date(a.time)); // 按时间倒序

    // 3. 写入磁盘
    fs.writeFileSync(filePath, JSON.stringify(finalLogs, null, 2));
    
    return finalLogs;
}

/**
 * 读取本地存储的所有记录
 */
function getLocalGacha(uid) {
    const filePath = path.join(GACHA_DIR, `${uid}.json`);
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return null;
}

module.exports = { saveAndMergeGacha, getLocalGacha };
