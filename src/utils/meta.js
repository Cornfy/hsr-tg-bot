// src/utils/meta.js
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const META_PATH = path.join(process.cwd(), 'data', 'meta-sr');
let weaponIndex = null;

function getWeaponDesc(weaponId, rank = 1) {
    // 如果根目录下的 data 文件夹里没有 meta-sr，直接退还空，不折腾
    if (!fs.existsSync(META_PATH)) return "";
    try {
        // 1. 加载武器索引 (获取该 ID 对应的 名字和命途)
        if (!weaponIndex) {
            const indexPath = path.join(META_PATH, 'weapon', 'data.json');
            if (fs.existsSync(indexPath)) {
                weaponIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
            } else {
                return ""; // 连索引都没有，直接放弃
            }
        }

        const basicInfo = weaponIndex ? weaponIndex[weaponId] : null;
        if (!basicInfo) {
            logger.warn(`未找到武器索引 ID: ${weaponId}`);
            return "暂无武器详情";
        }

        // 2. 拼接具体武器的 data.json 路径
        // 注意：basicInfo.type 是 "记忆", basicInfo.name 是 "爱如此刻永恒"
        const weaponPath = path.join(META_PATH, 'weapon', basicInfo.type, basicInfo.name, 'data.json');
        
        if (!fs.existsSync(weaponPath)) {
            logger.warn(`武器详情文件不存在: ${weaponPath}`);
            // 如果分级目录没找到，返回索引里的简易描述兜底
            return (basicInfo.desc || "资源文件缺失").replace(/<[^>]+>/g, '');
        }

        const weaponDetail = JSON.parse(fs.readFileSync(weaponPath, 'utf-8'));
        const skill = weaponDetail.skill;
        if (!skill || !skill.desc) return "暂无技能描述";

        let desc = skill.desc;
        const tables = skill.tables || {};
        const idx = Math.max(0, Math.min(rank - 1, 4));

        // 3. 增强版正则：支持 [i], [f1], [f2] 等所有占位符
        desc = desc.replace(/\$(\d+)\[([if]\d*)\]/g, (match, p1, p2) => {
            const valArray = tables[p1];
            if (!valArray) return match;
            const val = valArray[idx];
            if (val === undefined) return match;

            if (p2 === 'i') {
                return Math.round(val).toString();
            } else if (p2.startsWith('f')) {
                const decimalPlaces = parseInt(p2.slice(1)) || 1;
                return val.toFixed(decimalPlaces);
            }
            return val.toString();
        });

        // 4. 清理文案
        return desc
            .replace(/<br\s*\/?>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/ +/g, ' ')
            .trim();

    } catch (e) {
        logger.error(`武器描述解析失败 (ID: ${weaponId})`, e.message);
        return "文案解析异常";
    }
}

module.exports = { getWeaponDesc };
