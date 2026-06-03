// src/utils/gacha-render.js
const moment = require('moment');
const path = require('path');
const { loadModule } = require('./loader');

// 加载配置
const getCfg = () => ({
    CONST: loadModule(path.join(process.cwd(), 'config/game-constants.js')),
    I18N: loadModule(path.join(process.cwd(), 'config/bot-i18n.js')).I18N,
    SETTINGS: loadModule(path.join(process.cwd(), 'config/app-settings.js'))
});

/**
 * 计算字符串的显示宽度（全角字符算 2，半角算 1）
 */
function getDisplayWidth(str) {
    return [...str].reduce((width, char) => width + (/[^\x00-\xff]/.test(char) ? 2 : 1), 0);
}

/**
 * 右侧填充空格以对齐表格文本
 */
function padRight(str, targetLength) {
    const currentLength = getDisplayWidth(str);
    return currentLength >= targetLength 
        ? str 
        : str + ' '.repeat(targetLength - currentLength);
}

/**
 * 动态渲染彩色进度条
 */
function renderColorfulBar(pity, poolId, gachaSettings) {
    // 武器/光锥池保底为80，其余常驻和角色池为90
    const maxPity = ["12", "22"].includes(String(poolId)) ? 80 : 90;
    const { THRESHOLDS, UI } = gachaSettings;
    const barLength = 10;
    const filledCount = Math.round((Math.min(pity, maxPity) / maxPity) * barLength);

    let colorIcon = UI.COLORS.BAD;
    if (pity <= THRESHOLDS.LUCKY) {
        colorIcon = UI.COLORS.LUCKY;
    } else if (pity <= THRESHOLDS.NORMAL) {
        colorIcon = UI.COLORS.NORMAL;
    }

    return `${colorIcon} ${UI.BAR_FULL.repeat(filledCount)}${UI.BAR_EMPTY.repeat(barLength - filledCount)}`;
}

/**
 * 动态判定非欧评价
 */
function getLuckLevel(averagePulls, gachaSettings) {
    const val = parseFloat(averagePulls);
    const { THRESHOLDS, UI } = gachaSettings;
    
    if (val === 0) return UI.LABELS.NONE;
    if (val < THRESHOLDS.LUCKY) return UI.LABELS.LUCKY;
    if (val < THRESHOLDS.NORMAL) return UI.LABELS.NORMAL;

    return UI.LABELS.BAD;
}

/**
 * 分析并整理抽卡数据
 */
function analyseGacha(logs, poolId) {
    const { CONST } = getCfg();
    const targetPoolId = String(poolId);

    const poolLogs = logs
        .filter(log => String(log.gacha_type) === targetPoolId)
        .sort((a, b) => new Date(a.time) - new Date(b.time));

    if (poolLogs.length === 0) return null;

    const stats = {
        total: poolLogs.length,
        fiveStarRecords: [],
        fiveStarCount: 0,
        offBannerCount: 0,
        fourStarCount: 0,
        currentPity: 0
    };

    poolLogs.forEach(item => {
        stats.currentPity++;
        const rankType = String(item.rank_type);

        if (rankType === "4") {
            stats.fourStarCount++;
        }

        if (rankType === "5") {
            stats.fiveStarCount++;
            let isOffBanner = false;

            // 判定是否歪了 (11/21 为角色池，12/22 为武器/光锥池)
            if (["11", "21"].includes(targetPoolId) && CONST.STANDARD_DATA.chars.includes(item.name)) {
                isOffBanner = true;
            } else if (["12", "22"].includes(targetPoolId) && CONST.STANDARD_DATA.weapons.includes(item.name)) {
                isOffBanner = true;
            }

            if (isOffBanner) {
                stats.offBannerCount++;
            }

            stats.fiveStarRecords.push({
                name: item.name,
                pity: stats.currentPity,
                date: moment(item.time).format('MM-DD'),
                isUp: !isOffBanner || targetPoolId === "1" // 常驻池(1)全视为 UP/不歪
            });

            stats.currentPity = 0;
        }
    });

    // 计算均金 (排除了当前积累的垫抽)
    stats.avg = stats.fiveStarCount > 0 
        ? ((stats.total - stats.currentPity) / stats.fiveStarCount).toFixed(1) 
        : 0;

    // 计算平均 UP 数
    const upCount = stats.fiveStarCount - stats.offBannerCount;
    stats.avgUp = upCount > 0 
        ? ((stats.total - stats.currentPity) / upCount).toFixed(1)
        : 0;

    return stats;
}

/**
 * 渲染抽卡分析报告文本
 */
function renderGachaText(uid, poolId, rawLogs) {
    const result = analyseGacha(rawLogs, poolId);
    const { CONST, I18N, SETTINGS } = getCfg();
    
    if (!result) return I18N.GACHA.EMPTY_DATA;

    const poolNames = CONST.GACHA_POOLS;
    const gachaSettings = SETTINGS.GACHA_SETTINGS;
    const luckLevel = getLuckLevel(result.avg, gachaSettings);

    // 标题区
    let msg = I18N.GACHA.REPORT.TITLE
        .replace('{pool}', poolNames[poolId])
        .replace('{uid}', uid)
        .replace('{luck}', luckLevel);

    // 统计数据区 (完全基于 I18N 配置进行干净替换)
    msg += I18N.GACHA.REPORT.STATS
        .replace('{total}', result.total)
        .replace('{cost}', (result.total * 160).toLocaleString())
        .replace('{gold}', result.fiveStarCount)
        .replace('{wai}', result.offBannerCount)
        .replace('{avg}', result.avg)
        .replace('{avg_up}', result.avgUp)
        .replace('{p_rate}', ((result.fourStarCount / result.total) * 100).toFixed(1))
        .replace('{p_count}', result.fourStarCount);

    // 当前进度区
    msg += I18N.GACHA.REPORT.PITY
        .replace('{pity}', result.currentPity)
        .replace('{bar}', renderColorfulBar(result.currentPity, poolId, gachaSettings));

    // 历史记录表格渲染
    const maxListSize = 15;
    const recentRecords = [...result.fiveStarRecords].reverse().slice(0, maxListSize);
    
    // 动态对齐物品名列宽
    const maxNameLen = Math.max(10, ...recentRecords.map(record => getDisplayWidth(record.name)));

    const headerDate = '日期  '; 
    const headerName = padRight('物品', maxNameLen) + ' ';
    const headerPity = '抽数 ';
    const headerBar  = '进度';
    
    let tableStr = `${headerDate}${headerName}${headerPity}${headerBar}\n`;
    tableStr += `${'-'.repeat(9 + maxNameLen + 1 + 5 + 12)}\n`;

    recentRecords.forEach(record => {
        const offBannerTag = !record.isUp ? ' [歪]' : '';
        const namePart = padRight(record.name, maxNameLen);
        const pityPart = `[${String(record.pity).padStart(2)}]`;
        const barPart = renderColorfulBar(record.pity, poolId, gachaSettings);

        tableStr += `${record.date} ${namePart} ${pityPart} ${barPart}${offBannerTag}\n`;
    });

    msg += I18N.GACHA.REPORT.HISTORY.replace('{table}', tableStr);

    // 更多记录提示
    if (result.fiveStarRecords.length > maxListSize) {
        msg += I18N.GACHA.REPORT.MORE.replace('{count}', result.fiveStarRecords.length - maxListSize);
    }

    return msg;
}

/**
 * 渲染不支持的游戏提示
 */
function renderUnsupportedGame(gameCode) {
    const { CONST, I18N } = getCfg();
    const gameName = CONST.GACHA_GAME_NAMES[gameCode] || gameCode;
    
    return I18N.GACHA.UNSUPPORTED_GAME
        .replace('{name}', gameName)
        .replace('{code}', gameCode);
}

module.exports = { renderGachaText, renderUnsupportedGame };
