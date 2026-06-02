// src/utils/profile-storage.js
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const PROFILE_DIR = path.join(process.cwd(), 'data', 'profiles');

// 确保目录存在
if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

/**
 * 将玩家角色数据持久化到硬盘
 */
function saveProfile(uid, data) {
    const filePath = path.join(PROFILE_DIR, `${uid}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * 从硬盘读取缓存的玩家数据
 */
function getProfile(uid) {
    const filePath = path.join(PROFILE_DIR, `${uid}.json`);
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {
            logger.error(`读取存档文件失败 (UID: ${uid})`, e.message);
            return null;
        }
    }
    return null;
}

module.exports = { saveProfile, getProfile };
