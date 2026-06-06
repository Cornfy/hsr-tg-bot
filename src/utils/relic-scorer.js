// src/utils/relic-scorer.js
/**
 * 遗器评分系统
 * 提供遗器词条解析、权重计算及评分功能，用于评估遗器与角色的契合度
 */
const { loadModule } = require('./loader');
const path = require('path');

/**
 * 获取核心游戏配置 (HSR)
 * @returns {Object} 包含统计信息和游戏规则的游戏配置
 */
const getGameConst = () => {
    const constants = loadModule(path.join(process.cwd(), 'config/game-constants.js'));
    return constants.HSR;
};

/**
 * 将遗器属性 ID 解析为用于界面显示的简短名称
 * @param {string} id - 属性 ID (可能包含 _pc 后缀表示百分比)
 * @returns {string} 可读的属性名称
 */
function resolveStatName(id) {
    const { STATS } = getGameConst();
    
    // 处理 _pc 后缀 (百分比属性标识)
    let isPercent = id.endsWith('_pc');
    let baseId = isPercent ? id.replace('_pc', '') : id;
    
    // 从配置映射表中获取对应名称
    const statCfg = STATS[baseId] || [baseId, baseId];
    let name = statCfg[0];
    let short = statCfg[1];

    // 如果是数值属性(非百分比)且为基础三维(HP/ATK/DEF)，添加“值”前缀以明确区分
    if (!isPercent && ['hp', 'atk', 'def'].includes(baseId)) {
        return `值${short}`;
    }

    return short;
}

/**
 * 获取特定角色的有效属性权重描述
 * @param {string} charName - 角色名称
 * @returns {string} 属性权重描述字符串
 */
function getWeightsForChar(charName) {
    let allWeights = {};
    try {
        allWeights = require(path.join(process.cwd(), 'config/weights.js'));
    } catch (e) {
        // 默认权重设置
        allWeights = { default: { spd: 1, crit_rate: 1, crit_dmg: 1 } };
    }
    
    const weights = allWeights[charName] || allWeights["default"];
    
    // 过滤掉无效/零权重属性并进行格式化
    return Object.entries(weights)
        .filter(([_, v]) => v > 0)
        .map(([k, v]) => `${resolveStatName(k)}${v}`)
        .join(' ');
}

/**
 * 对单件遗器进行详细分析与评分
 * @param {Object} relic - 遗器数据对象 (包含 sub_affix 词条信息)
 * @param {string} charName - 目标角色名称
 * @returns {Object} 包含词条详细分析结果和最终评分的对象
 */
function getRelicAnalysis(relic, charName) {
    const { STATS } = getGameConst();

    let allWeights = {};
    try {
        allWeights = require(path.join(process.cwd(), 'config/weights.js'));
    } catch (e) {
        allWeights = { default: { spd: 1, crit_rate: 1, crit_dmg: 1 } };
    }

    const weights = allWeights[charName] || allWeights["default"];
    let validRolls = 0; // 总有效词条数

    // 逐词条进行分析
    const subStats = relic.sub_affix.map(s => {
        let weight = 0;
        const isPercent = s.display.includes('%');
        const field = s.field;
        const isBaseStat = ['hp', 'atk', 'def'].includes(field);

        // 根据属性类型计算权重贡献
        if (isBaseStat) {
            // 1. 基础三维（生命、攻击、防御）：自动处理大小词条映射逻辑
            const fieldPc = field + '_pc';
            const targetKey = isPercent ? fieldPc : field;
            const altKey = isPercent ? field : fieldPc;

            if (weights[targetKey] !== undefined) {
                weight = parseFloat(weights[targetKey]);
            } else if (weights[altKey] !== undefined) {
                // 如果命中互补属性，权重按比例折算
                weight = isPercent ? parseFloat(weights[altKey]) * 2 : parseFloat(weights[altKey]) * 0.5;
            }
        } else {
            // 2. 其他属性（速度、击破、双暴等）：直接按配置映射读取权重
            if (weights[field] !== undefined) {
                weight = parseFloat(weights[field]);
            }
        }

        // 计算贡献度并累计
        const contribution = s.count * weight;
        validRolls += contribution;

        // 格式化强化次数显示 (例如：[2↑])
        const upgradeCount = s.count - 1;
        const rollMark = upgradeCount === 0 ? "[-]  " : `[${upgradeCount}↑]`.padEnd(5);

        // 统一名称解析用于 UI 展示
        const rawName = s.name.replace('百分比', '');
        const statCfg = STATS[field] || [rawName, rawName.slice(0, 2)];
        const displayName = statCfg[1];

        return {
            name: `${displayName}${isPercent ? '%' : ' '}`,
            value: (isPercent ? (s.value * 100).toFixed(1) + "%" : s.value.toFixed(1)),
            rollMark: rollMark,
            contribution: contribution > 0 ? contribution.toFixed(1) : "-"
        };
    });

    return { subStats, validRolls: parseFloat(validRolls).toFixed(1) };
}

module.exports = { getRelicAnalysis, getWeightsForChar };
