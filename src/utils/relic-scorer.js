// src/utils/relic-scorer.js
const { loadModule } = require('./loader');
const path = require('path');

// 动态加载 UI 配置
const getUiCfg = () => loadModule(path.join(process.cwd(), 'config/ui-config.js'));

/**
 * 解析属性 ID 为简短名称
 */
function resolveStatName(id) {
    const { STATS } = getUiCfg();
    
    // 处理 _pc 后缀 (百分比权重)
    let isPercent = id.endsWith('_pc');
    let baseId = isPercent ? id.replace('_pc', '') : id;
    
    // 基础名称映射 (从 STATS 对象中获取 [全称, 简称])
    const statCfg = STATS[baseId] || [baseId, baseId];
    let name = statCfg[0];
    let short = statCfg[1];

    // 如果是数值属性(非百分比)且为基础三维，加上“值”前缀以示区别
    if (!isPercent && ['hp', 'atk', 'def'].includes(baseId)) {
        return `值${short}`;
    }

    return short;
}

function getWeightsForChar(charName) {
    let allWeights = {};
    try {
        allWeights = loadModule(path.join(process.cwd(), 'config/weights.js'));
    } catch (e) {
        allWeights = { default: { spd: 1, crit_rate: 1, crit_dmg: 1 } };
    }
    const weights = allWeights[charName] || allWeights["default"];
    return Object.entries(weights)
        .filter(([_, v]) => v > 0)
        .map(([k, v]) => `${resolveStatName(k)}${v}`)
        .join(' ');
}

function getRelicAnalysis(relic, charName) {
    const uiCfg = getUiCfg();
    const { STATS } = uiCfg;

    let allWeights = {};
    try {
        allWeights = loadModule(path.join(process.cwd(), 'config/weights.js'));
    } catch (e) {
        allWeights = { default: { spd: 1, crit_rate: 1, crit_dmg: 1 } };
    }

    const weights = allWeights[charName] || allWeights["default"];
    let validRolls = 0;

    const subStats = relic.sub_affix.map(s => {
        let weight = 0;
        const isPercent = s.display.includes('%');
        const field = s.field;
        const isBaseStat = ['hp', 'atk', 'def'].includes(field);

        if (isBaseStat) {
            // 1. 基础三维（生命、攻击、防御）：启用大/小词条自动互补逻辑
            const fieldPc = field + '_pc';
            const targetKey = isPercent ? fieldPc : field;
            const altKey = isPercent ? field : fieldPc;

            if (weights[targetKey] !== undefined) {
                weight = parseFloat(weights[targetKey]);
            } else if (weights[altKey] !== undefined) {
                weight = isPercent ? parseFloat(weights[altKey]) * 2 : parseFloat(weights[altKey]) * 0.5;
            }
        } else {
            // 2. 其他属性（速度、击破、双暴等）：直接按原字段读取权重
            if (weights[field] !== undefined) {
                weight = parseFloat(weights[field]);
            }
        }

        const contribution = s.count * weight;
        validRolls += contribution;

        const upgradeCount = s.count - 1;
        const rollMark = upgradeCount === 0 ? "[-]  " : `[${upgradeCount}↑]`.padEnd(5);

        // 统一名称解析
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
