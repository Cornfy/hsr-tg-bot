// src/bot/handlers/gacha.js
const { Markup } = require('telegraf');
const gachaApi = require('../../api/gacha-api');
const gachaStorage = require('../../utils/gacha-storage');
const gachaRender = require('../../utils/gacha-render');
const cache = require('../../cache');
const api = require('../../api/mihomo-api');
const axios = require('axios');
const logger = require('../../utils/logger');
const { loadModule } = require('../../utils/loader');
const path = require('path');

const getGachaKeyboard = (uid) => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('🎭 角色活动', `gacha_pool:${uid}:11`),
            Markup.button.callback('🗡️ 光锥活动', `gacha_pool:${uid}:12`)
        ],
        [
            Markup.button.callback('⏳ 常驻跃迁', `gacha_pool:${uid}:1`),
            Markup.button.callback('🏠 个人中心', `back_to_me:${uid}`)
        ]
    ]);
};


/**
 * 智能提取并初步预检 URL
 */
function resolveGachaUrl(ctx) {
    const text = ctx.message?.text || "";
    const urlPattern = /https?:\/\/[^\s]+/;
    let match = text.match(urlPattern);
    
    if (!match && ctx.message?.reply_to_message?.text) {
        match = ctx.message.reply_to_message.text.match(urlPattern);
    }

    if (!match) return null;
    const urlStr = match[0];

    try {
        const urlObj = new URL(urlStr);
        const host = urlObj.hostname;
        const search = urlObj.search + urlObj.hash;

        // 启发式特征：只要符合其中一项，就判定为“疑似抽卡链接”
        const isOfficial = /mihoyo\.com$|hoyoverse\.com$|bilibili\.com$/.test(host);
        const hasGachaKeywords = /gacha|authkey|hkrpg|game_biz/.test(search + urlObj.pathname);

        if (isOfficial || hasGachaKeywords) {
            return { url: urlStr, suspicious: false };
        } else {
            // 虽然是有效 URL，但看起来跟抽卡没关系
            return { url: urlStr, suspicious: true };
        }
    } catch (e) {
        return null; // 完全不是有效的 URL 格式
    }
}

/**
 * 启发式 JSON 数据提取器
 * 尝试从千奇百怪的第三方格式中找到 UID 和 记录列表
 */
function heuristicExtractGacha(data) {
    let uid = "";
    let logs = [];

    // 1. 深度优先搜索所有数组，寻找最像抽卡记录的那一个
    function findLogs(obj) {
        if (!obj || typeof obj !== 'object') return;
        
        // 如果是数组，检查内容
        if (Array.isArray(obj)) {
            // 抽卡记录的特征：对象包含 id, name, gacha_type, time 等
            const sample = obj[0];
            if (sample && sample.id && (sample.name || sample.item_id) && sample.gacha_type) {
                logs = obj;
                // 顺便从第一个记录里拿 UID
                if (!uid) uid = sample.uid;
            }
        }
        
        // 递归搜索
        for (const key in obj) {
            if (uid && logs.length > 0) break;
            findLogs(obj[key]);
        }
    }

    // 2. 尝试从常见位置找 UID (如果记录里没带)
    if (data.info?.uid) uid = data.info.uid;
    else if (data.uid) uid = data.uid;

    findLogs(data);

    return { uid, logs };
}

const setupGachaHandlers = (bot) => {
    // 监听文档发送
    bot.on('document', async (ctx) => {
        const { TEXT } = loadModule(path.join(process.cwd(), 'config/ui-config.js'));
        if (!ctx.message.document.file_name.endsWith('.json')) return;
        
        await ctx.reply(TEXT.gacha.loading);
        try {
            const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
            const res = await axios.get(fileLink.href);
            const data = res.data;

            const { uid, logs } = heuristicExtractGacha(data);

            if (!uid || !logs || logs.length === 0) {
                throw new Error(TEXT.gacha.err_no_data);
            }

            const finalLogs = gachaStorage.saveAndMergeGacha(uid, logs);
            logger.done(`用户 ${ctx.from.id} 通过 JSON 导入 UID ${uid} 的抽卡记录 (${logs.length}条)`);
            
            await ctx.reply(TEXT.gacha.import_success.replace('{uid}', uid).replace('{count}', logs.length), {
                parse_mode: 'HTML',
                ...getGachaKeyboard(uid)
            });

        } catch (e) {
            logger.error(`JSON 抽卡记录导入失败`, e);
            ctx.reply(TEXT.gacha.tpl_import_fail.replace('{error}', e.message));
        }
    });

    bot.command('gacha', async (ctx) => {
        const { TEXT } = loadModule(path.join(process.cwd(), 'config/ui-config.js'));
        const url = resolveGachaUrl(ctx);
        
        if (!url) {
            const args = ctx.message.text.trim().split(/\s+/);
            if (args.length > 1) {
                // 用户输入了参数但不是有效链接
                return ctx.reply(TEXT.gacha.invalid_url, { parse_mode: 'HTML' });
            }

            return ctx.reply(TEXT.gacha.help, { 
                parse_mode: 'HTML',
                reply_markup: Markup.forceReply().reply_markup
            });
        }

        await ctx.reply(TEXT.common.loading);
        
        // 不再预校验 authkey，直接交给 API 处理，API 报错再提示
        const result = await gachaApi.fetchGachaLogs(url);
        
        if (!result || !result.uid) {
            logger.warn(`用户 ${ctx.from.id} 尝试同步抽卡记录失败: 链接无效或过期`);
            return ctx.reply(TEXT.gacha.api_failed);
        }

        const finalLogs = gachaStorage.saveAndMergeGacha(result.uid, result.logs);
        logger.done(`用户 ${ctx.from.id} 同步 UID ${result.uid} 抽卡记录成功 (新增 ${result.logs.length}条)`);
        
        const msg = gachaRender.renderGachaText(result.uid, "11", finalLogs);
        await ctx.reply(msg, {
            parse_mode: 'HTML',
            ...getGachaKeyboard(result.uid)
        });
    });

    bot.action(/^gacha_pool:([1-9]\d{8}):(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const [_, uid, poolId] = ctx.match;
        const logs = gachaStorage.getLocalGacha(uid);
        if (!logs) return;
        
        const msg = gachaRender.renderGachaText(uid, poolId, logs);
        try {
            await ctx.editMessageText(msg, {
                parse_mode: 'HTML',
                ...getGachaKeyboard(uid)
            });
        } catch (e) { if (!e.message.includes('not modified')) logger.error('编辑抽卡分析消息失败', e.message); }
    });

    bot.action(/^back_to_me:([1-9]\d{8})$/, async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const uid = ctx.match[1];
        const data = await api.getPlayerDetail(uid);
        if (!data) return;

        const { renderPlayerInfo, getMainMenuKeyboard } = require('./profile');
        
        await ctx.editMessageText(renderPlayerInfo(data), {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(uid, data.characters)
        }).catch(() => {});
    });
};

module.exports = { setupGachaHandlers, resolveGachaUrl };
