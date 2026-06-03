const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * 获取存储路径
 * 结构：data/{gameCode}/profile/{uid}.json
 */
function getStoragePath(gameCode, uid) {
    const dir = path.join(DATA_DIR, gameCode, 'profile');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, `${uid}.json`);
}

/**
 * 保存玩家面板数据
 */
function saveProfile(uid, data, gameCode = 'HSR') {
    const filePath = getStoragePath(gameCode, uid);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * 获取本地缓存的面板数据
 */
function getProfile(uid, gameCode = 'HSR') {
    const filePath = getStoragePath(gameCode, uid);
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return null;
}

module.exports = { saveProfile, getProfile };
