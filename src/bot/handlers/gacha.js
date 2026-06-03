// src/bot/handlers/gacha.js
const { Markup } = require('telegraf');
const gachaApi = require('../../api/gacha-api');
const gachaStorage = require('../../utils/gacha-storage');
const gachaRender = require('../../utils/gacha-render');
const api = require('../../api/mihomo-api');
const axios = require('axios');
const logger = require('../../utils/logger');
const { loadModule } = require('../../utils/loader');
const path = require('path');
const gachaParser = require('../../utils/gacha-parser');

// 统一加载配置
const getCfg = () => ({
    CONST: loadModule(path.join(process.cwd(), 'config/game-constants.js')),
    I18N: loadModule(path.join(process.cwd(), 'config/bot-i18n.js')).I18N,
    SETTINGS: loadModule(path.join(process.cwd(), 'config/app-settings.js'))
});

const getGachaKeyboard = (uid, gameCode = 'HSR') => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('🎭 角色活动', `gacha_pool:${gameCode}:${uid}:11`),
            Markup.button.callback('🗡️ 光锥活动', `gacha_pool:${gameCode}:${uid}:12`)
        ],
        [
            Markup.button.callback('🤝 联动角色', `gacha_pool:${gameCode}:${uid}:21`),
            Markup.button.callback('🏹 联动光锥', `gacha_pool:${gameCode}:${uid}:22`)
        ],
        [
            Markup.button.callback('⏳ 常驻跃迁', `gacha_pool:${gameCode}:${uid}:1`),
            Markup.button.callback('⬅️ 返回主页', `back_to_me:${uid}`)
        ]
    ]);
};

const setupGachaHandlers = (bot) => {
    // 监听文档发送 (JSON 导入)
    bot.on('document', async (ctx) => {
        const { I18N, CONST } = getCfg();
        if (!ctx.message.document.file_name.endsWith('.json')) return;
        
        await ctx.reply(I18N.GACHA.LOADING);
        try {
            const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
            const res = await axios.get(fileLink.href);
            
            // 使用统一解析器处理 JSON
            const { uid, logs } = gachaParser.parseGachaJson(res.data);

            if (!uid || !logs || logs.length === 0) {
                throw new Error(I18N.GACHA.ERROR_NO_DATA);
            }

            // 3. 保存并合并 (JSON 提取 metadata)
            const finalLogs = gachaStorage.saveAndMergeGacha(uid, logs, {
                gameCode: 'HSR',
                game_biz: res.data.info?.game_biz || 'hkrpg_cn',
                region: res.data.info?.region || 'prod_gf_cn'
            }); 
            logger.done(`用户 ${ctx.from.id} 通过 JSON 导入 UID ${uid} 的抽卡记录 (${logs.length}条)`);
            
            await ctx.reply(I18N.GACHA.IMPORT_SUCCESS.replace('{uid}', uid).replace('{count}', logs.length), {
                parse_mode: 'HTML',
                ...getGachaKeyboard(uid, 'HSR')
            });

        } catch (e) {
            logger.error(`JSON 抽卡记录导入失败`, e);
            ctx.reply(I18N.GACHA.IMPORT_FAIL.replace('{error}', e.message));
        }
    });

    // /gacha 指令 (URL 同步)
    bot.command('gacha', async (ctx) => {
        const { I18N } = getCfg();
        const text = ctx.message.text || "";
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        const input = urlMatch ? urlMatch[0] : (ctx.message.reply_to_message?.text || "");

        // 使用统一解析器处理 URL
        const params = await gachaParser.parseGachaUrl(input);
        
        if (!params) {
            return ctx.reply(I18N.GACHA.HELP_PROMPT, { 
                parse_mode: 'HTML',
                reply_markup: Markup.forceReply().reply_markup
            });
        }

        await ctx.reply(I18N.COMMON.LOADING);
        const result = await gachaApi.fetchGachaLogs(params);
        
        if (result?.error === 'UNSUPPORTED_GAME') {
            return ctx.reply(gachaRender.renderUnsupportedGame(result.gameCode), { parse_mode: 'HTML' });
        }

        if (!result || !result.uid) {
            logger.warn(`用户 ${ctx.from.id} 尝试同步抽卡记录失败: 链接无效或过期`);
            return ctx.reply(I18N.GACHA.API_FAILED);
        }

        // 3. 保存并合并 (带元数据)
        const finalLogs = gachaStorage.saveAndMergeGacha(result.uid, result.logs, {
            gameCode: result.gameCode,
            game_biz: result.game_biz,
            region: result.region
        });
        logger.done(`用户 ${ctx.from.id} 同步 UID ${result.uid} [${result.gameCode}] 抽卡记录成功 (新增 ${result.logs.length}条)`);
        
        const msg = gachaRender.renderGachaText(result.uid, "11", finalLogs);
        await ctx.reply(msg, {
            parse_mode: 'HTML',
            ...getGachaKeyboard(result.uid, result.gameCode)
        });
    });

    bot.action(/^gacha_pool:(\w+):([1-9]\d{8}):(\d+)$/, async (ctx) => {
        const { I18N, CONST } = getCfg();
        await ctx.answerCbQuery().catch(() => {});
        const [_, gameCode, uid, poolId] = ctx.match;

        if (gameCode !== 'HSR') {
            return ctx.editMessageText(gachaRender.renderUnsupportedGame(gameCode), {
                parse_mode: 'HTML',
                ...getGachaKeyboard(uid, gameCode)
            }).catch(() => {});
        }

        const logs = gachaStorage.getLocalGacha(uid, gameCode);
        if (!logs || logs.length === 0) {
            return ctx.editMessageText(I18N.GACHA.EMPTY_DATA, {
                parse_mode: 'HTML',
                ...getGachaKeyboard(uid, gameCode)
            }).catch(() => {});
        }

        const msg = gachaRender.renderGachaText(uid, poolId, logs);
        try {
            await ctx.editMessageText(msg, {
                parse_mode: 'HTML',
                ...getGachaKeyboard(uid, gameCode)
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

module.exports = { setupGachaHandlers };
