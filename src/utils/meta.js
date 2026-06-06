// src/utils/meta.js
/**
 * 游戏元数据处理工具
 * 提供读取游戏资源文件（武器、技能描述等）并格式化输出的能力
 */
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// 元数据资源基路径
const META_PATH = path.join(process.cwd(), 'data', 'meta-sr');
let weaponIndex = null; // 武器索引缓存

/**
 * 获取并格式化武器的技能描述
 * @param {string|number} weaponId - 武器 ID
 * @param {number} [rank=1] - 武器叠影等级 (1-5)
 * @returns {string} 格式化后的武器技能描述文案
 */
function getWeaponDesc(weaponId, rank = 1) {
    // 检查资源库是否存在
    if (!fs.existsSync(META_PATH)) return "";

    try {
        // 1. 懒加载武器索引文件，用于将 ID 映射为路径信息
        if (!weaponIndex) {
            const indexPath = path.join(META_PATH, 'weapon', 'data.json');
            if (fs.existsSync(indexPath)) {
                weaponIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
            } else {
                return ""; // 缺少索引文件则无法继续
            }
        }

        const basicInfo = weaponIndex ? weaponIndex[weaponId] : null;
        if (!basicInfo) {
            logger.warn(`未找到武器索引 ID: ${weaponId}`);
            return "暂无武器详情";
        }

        // 2. 拼接具体武器的详情数据路径
        const weaponPath = path.join(META_PATH, 'weapon', basicInfo.type, basicInfo.name, 'data.json');
        
        if (!fs.existsSync(weaponPath)) {
            logger.warn(`武器详情文件不存在: ${weaponPath}`);
            // 兜底：返回索引里的简易描述
            return (basicInfo.desc || "资源文件缺失").replace(/<[^>]+>/g, '');
        }

        const weaponDetail = JSON.parse(fs.readFileSync(weaponPath, 'utf-8'));
        const skill = weaponDetail.skill;
        if (!skill || !skill.desc) return "暂无技能描述";

        let desc = skill.desc;
        const tables = skill.tables || {};
        const idx = Math.max(0, Math.min(rank - 1, 4)); // 映射到 0-4 的叠影索引

        // 3. 增强版正则：将文案中的占位符替换为基于叠影等级的具体数值
        // 支持格式: $1[i] (整数), $1[f1] (1位小数)
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

        // 4. 清理文案：移除 HTML 标签，替换换行符，整理空格
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
