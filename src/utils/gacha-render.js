// src/utils/gacha-render.js
const moment = require('moment');
const path = require('path');
const { loadModule } = require('./loader');

function getUiConfig() {
    return loadModule(path.join(process.cwd(), 'config/ui-config.js'));
}

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
function renderColorfulBar(pity, poolId, gachaUi) {
    const max = ["12", "22"].includes(String(poolId)) ? 80 : 90;
    const barLength = 10;
    const filled = Math.round((Math.min(pity, max) / max) * barLength);

    let colorIcon = gachaUi.colors.bad;
    if (pity <= gachaUi.thresholds.lucky) colorIcon = gachaUi.colors.lucky;
    else if (pity <= gachaUi.thresholds.normal) colorIcon = gachaUi.colors.normal;
    
    return colorIcon + " " + gachaUi.bar_full.repeat(filled) + gachaUi.bar_empty.repeat(barLength - filled);
}

/**
 * 动态判定非欧评价
 */
function getLuckLevel(avg, gachaUi) {
    const val = parseFloat(avg);
    if (val === 0) return gachaUi.labels.none;
    if (val < gachaUi.thresholds.lucky) return gachaUi.labels.lucky;
    if (val < gachaUi.thresholds.normal) return gachaUi.labels.normal;
    return gachaUi.labels.bad;
}

function analyseGacha(logs, poolId) {
    const uiCfg = getUiConfig();
    const { GACHA } = uiCfg;

    // 智能合并双 UP 池数据流 (11合并21, 12合并22)
    let targetTypes = [String(poolId)];
    if (["11", "21"].includes(String(poolId))) targetTypes = ["11", "21"];
    if (["12", "22"].includes(String(poolId))) targetTypes = ["12", "22"];

    const poolLogs = logs.filter(l => targetTypes.includes(String(l.gacha_type)))
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
            if (["11", "21"].includes(String(poolId)) && GACHA.standard.chars.includes(item.name)) isWai = true;
            else if (["12", "22"].includes(String(poolId)) && GACHA.standard.weapons.includes(item.name)) isWai = true;

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
    const uiCfg = getUiConfig();
    const { TEXT, GACHA } = uiCfg;
    if (!result) return TEXT.gacha.none;

    const poolNames = GACHA.pools;
    const gachaUi = GACHA.ui;
    const luck = getLuckLevel(result.avg, gachaUi);

    let msg = TEXT.gacha.res_title
        .replace('{pool}', poolNames[poolId])
        .replace('{uid}', uid)
        .replace('{luck}', luck);
    
    // 统计卡片
    msg += TEXT.gacha.res_stats
        .replace('{total}', result.total)
        .replace('{cost}', (result.total * 160).toLocaleString())
        .replace('{gold}', result.goldCount)
        .replace('{wai}', result.wai)
        .replace('{avg}', result.avg)
        .replace('{p_rate}', (result.purpleCount / result.total * 100).toFixed(1))
        .replace('{p_count}', result.purpleCount);

    // 当前保底
    msg += TEXT.gacha.res_pity
        .replace('{pity}', result.pity)
        .replace('{bar}', renderColorfulBar(result.pity, poolId, gachaUi));

    // 历史出金
    const list = [...result.gold].reverse().slice(0, 15);
    const maxNameLen = Math.max(10, ...list.map(g => getWidth(g.name)));

    // 表格标题栏与分隔线
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
        table += `${g.date} ${namePart} ${pityPart} ${renderColorfulBar(g.pity, poolId, gachaUi)}${waiTag}\n`;
    });

    msg += TEXT.gacha.res_history.replace('{table}', table);

    if (result.gold.length > 15) {
        msg += TEXT.gacha.res_more.replace('{count}', result.gold.length - 15);
    }
    
    return msg;
}

module.exports = { renderGachaText };
