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

function getWidth(str) {
    let width = 0;
    for (let char of str) {
        width += char.match(/[^\x00-\xff]/) ? 2 : 1;
    }
    return width;
}

function padRight(str, len) {
    let currentLen = getWidth(str);
    if (currentLen >= len) return str;
    return str + ' '.repeat(len - currentLen);
}

/**
 * 动态渲染彩色进度条
 */
function renderColorfulBar(pity, poolId, gachaSettings) {
    const max = ["12", "22"].includes(String(poolId)) ? 80 : 90;
    const { THRESHOLDS, UI } = gachaSettings;
    const barLength = 10;
    const filled = Math.round((Math.min(pity, max) / max) * barLength);

    let colorIcon = UI.COLORS.BAD;
    if (pity <= THRESHOLDS.LUCKY) colorIcon = UI.COLORS.LUCKY;
    else if (pity <= THRESHOLDS.NORMAL) colorIcon = UI.COLORS.NORMAL;
    
    return colorIcon + " " + UI.BAR_FULL.repeat(filled) + UI.BAR_EMPTY.repeat(barLength - filled);
}

/**
 * 动态判定非欧评价
 */
function getLuckLevel(avg, gachaSettings) {
    const val = parseFloat(avg);
    const { THRESHOLDS, UI } = gachaSettings;
    if (val === 0) return UI.LABELS.NONE;
    if (val < THRESHOLDS.LUCKY) return UI.LABELS.LUCKY;
    if (val < THRESHOLDS.NORMAL) return UI.LABELS.NORMAL;
    return UI.LABELS.BAD;
}

function analyseGacha(logs, poolId) {
    const { CONST } = getCfg();
    const targetType = String(poolId);

    const poolLogs = logs.filter(l => String(l.gacha_type) === targetType)
                         .sort((a, b) => new Date(a.time) - new Date(b.time));

    if (poolLogs.length === 0) return null;

    let stats = {
        total: poolLogs.length,
        gold: [],
        goldCount: 0,
        wai: 0,
        pity: 0,
        purpleCount: 0
    };

    let currentPity = 0;
    poolLogs.forEach(item => {
        currentPity++;
        if (item.rank_type == "4") stats.purpleCount++;
        if (item.rank_type == "5") {
            stats.goldCount++;
            let isWai = false;
            if (["11", "21"].includes(String(poolId)) && CONST.STANDARD_DATA.chars.includes(item.name)) isWai = true;
            else if (["12", "22"].includes(String(poolId)) && CONST.STANDARD_DATA.weapons.includes(item.name)) isWai = true;

            if (isWai) stats.wai++;
            stats.gold.push({
                name: item.name,
                pity: currentPity,
                date: moment(item.time).format('MM-DD'),
                isUp: !isWai || poolId == "1"
            });
            currentPity = 0;
        }
    });

    stats.pity = currentPity;
    stats.avg = stats.goldCount > 0 ? ((stats.total - stats.pity) / stats.goldCount).toFixed(1) : 0;
    return stats;
}

function renderGachaText(uid, poolId, rawLogs) {
    const result = analyseGacha(rawLogs, poolId);
    const { CONST, I18N, SETTINGS } = getCfg();
    if (!result) return I18N.GACHA.EMPTY_DATA;

    const poolNames = CONST.GACHA_POOLS;
    const gachaSettings = SETTINGS.GACHA_SETTINGS;
    const luck = getLuckLevel(result.avg, gachaSettings);

    let msg = I18N.GACHA.REPORT.TITLE
        .replace('{pool}', poolNames[poolId])
        .replace('{uid}', uid)
        .replace('{luck}', luck);
    
    // 统计卡片
    msg += I18N.GACHA.REPORT.STATS
        .replace('{total}', result.total)
        .replace('{cost}', (result.total * 160).toLocaleString())
        .replace('{gold}', result.goldCount)
        .replace('{wai}', result.wai)
        .replace('{avg}', result.avg)
        .replace('{p_rate}', (result.purpleCount / result.total * 100).toFixed(1))
        .replace('{p_count}', result.purpleCount);

    // 当前保底
    msg += I18N.GACHA.REPORT.PITY
        .replace('{pity}', result.pity)
        .replace('{bar}', renderColorfulBar(result.pity, poolId, gachaSettings));

    // 历史出金
    const list = [...result.gold].reverse().slice(0, 15);
    const maxNameLen = Math.max(10, ...list.map(g => getWidth(g.name)));

    const headerDate = '日期  '; 
    const headerName = padRight('物品', maxNameLen) + ' ';
    const headerPity = '抽数 ';
    const headerBar  = '进度';
    let table = `${headerDate}${headerName}${headerPity}${headerBar}\n`;
    table += `${'-'.repeat(9 + maxNameLen + 1 + 5 + 12)}\n`;

    list.forEach(g => {
        const waiTag = !g.isUp ? ' [歪]' : '';
        const namePart = padRight(g.name, maxNameLen);
        const pityPart = `[${String(g.pity).padStart(2)}]`;
        table += `${g.date} ${namePart} ${pityPart} ${renderColorfulBar(g.pity, poolId, gachaSettings)}${waiTag}\n`;
    });

    msg += I18N.GACHA.REPORT.HISTORY.replace('{table}', table);

    if (result.gold.length > 15) {
        msg += I18N.GACHA.REPORT.MORE.replace('{count}', result.gold.length - 15);
    }
    
    return msg;
}

function renderUnsupportedGame(gameCode) {
    const { CONST, I18N } = getCfg();
    const gameName = CONST.GACHA_GAME_NAMES[gameCode] || gameCode;
    return I18N.GACHA.UNSUPPORTED_GAME
        .replace('{name}', gameName)
        .replace('{code}', gameCode);
}

module.exports = { renderGachaText, renderUnsupportedGame };
