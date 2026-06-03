// src/bot/handlers/profile.js
const { Markup } = require('telegraf');
const api = require('../../api/mihomo-api');
const profileStorage = require('../../utils/profile-storage');
const cache = require('../../cache');
const { loadModule } = require('../../utils/loader');
const path = require('path');
const { getRelicAnalysis } = require('../../utils/relic-scorer');
const { getWeightsForChar } = require('../../../config/weights');

// 统一加载配置
const getCfg = () => ({
    CONST: loadModule(path.join(process.cwd(), 'config/game-constants.js')),
    I18N: loadModule(path.join(process.cwd(), 'config/bot-i18n.js')).I18N,
    SETTINGS: loadModule(path.join(process.cwd(), 'config/app-settings.js'))
});

/**
 * HTML 转义
 */
const esc = (str) => {
    if (!str) return "";
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

/**
 * 获取前端 UI 展示名称 (用于按钮、面板标题)
 * 样式：输出 "星 • 同谐" / "三月七 • 存护" / "黄泉"
 */
function getDisplayCharName(char) {
    const { SETTINGS } = getCfg();
    const { CHAR_RULES } = SETTINGS;
    const id = String(char.id);
    
    // 1. 匹配主角规则
    if (id.startsWith(CHAR_RULES.trailblazer_prefix)) {
        const isFemale = parseInt(id, 10) % 2 === 0;
        const baseName = isFemale ? CHAR_RULES.trailblazer_ui.female : CHAR_RULES.trailblazer_ui.male;
        return `${baseName} • ${char.path?.name || ''}`;
    }
    
    // 2. 匹配常规多命途角色规则
    if (CHAR_RULES.multi_path_names.includes(char.name)) {
        return `${char.name} • ${char.path?.name || ''}`;
    }
    
    return char.name;
}

/**
 * 获取后端逻辑名称 (用于遗器评分、权重文件匹配)
 * 样式：严格输出 "开拓者•同谐" / "三月七•巡猎" / "黄泉"（无空格）
 */
function getLogicCharName(char) {
    const { SETTINGS } = getCfg();
    const { CHAR_RULES } = SETTINGS;
    const id = String(char.id);
    
    // 1. 匹配主角规则
    if (id.startsWith(CHAR_RULES.trailblazer_prefix)) {
        return `开拓者•${char.path?.name || ''}`;
    }
    
    // 2. 匹配常规多命途角色规则
    if (CHAR_RULES.multi_path_names.includes(char.name)) {
        return `${char.name}•${char.path?.name || ''}`;
    }
    
    return char.name;
}

/**
 * 首页菜单 (主要功能模块 + 常用角色)
 */
const getMainMenuKeyboard = (uid, characters = []) => {
    const keyboard = [];
    // 前 4 个常用角色
    const quickChars = characters.slice(0, 4);
    for (let i = 0; i < quickChars.length; i += 2) {
        const row = quickChars.slice(i, i + 2).map(c => Markup.button.callback(getDisplayCharName(c), `profile:${uid}:${c.id}`));
        keyboard.push(row);
    }

    keyboard.push([
        Markup.button.callback('🎭 展柜列表', `showcase:${uid}`),
        Markup.button.callback('📊 抽卡统计', `gacha_pool:${uid}:11`),
        Markup.button.callback('🔄 同步游戏数据', `sync_profile:${uid}`)
    ]);

    return Markup.inlineKeyboard(keyboard);
};

const getShowcaseKeyboard = (uid, characters) => {
    const buttons = characters.map(c => Markup.button.callback(getDisplayCharName(c), `profile:${uid}:${c.id}`));
    const keyboard = [];
    for (let i = 0; i < buttons.length; i += 2) keyboard.push(buttons.slice(i, i + 2));
    keyboard.push([Markup.button.callback('⬅️ 返回主页', `back_to_me:${uid}`)]);
    return Markup.inlineKeyboard(keyboard);
};

const renderPlayerInfo = (data) => {
    const { I18N } = getCfg();
    const T = I18N.PLAYER_CENTER.DASHBOARD;
    let msg = T.TITLE;
    
    if (data._isQueuing) msg += T.QUEUING;
    if (data._fromCache) msg += T.FALLBACK;

    msg += T.INFO
        .replace('{nickname}', esc(data.player.nickname))
        .replace('{uid}', data.player.uid)
        .replace('{level}', data.player.level)
        .replace('{achievement}', data.player.cur_achievement_num)
        .replace('{avatar}', data.player.cur_avatar_num);

    return msg;
};

const setupProfileHandlers = (bot) => {
    bot.command('bind', async (ctx) => {
        const { I18N } = getCfg();
        const args = ctx.message.text.split(' ');
        const uid = args[1];

        if (!uid || !/^[1-9]\d{8}$/.test(uid)) {
            return ctx.reply(I18N.AUTH.BIND_PROMPT, { parse_mode: 'HTML' });
        }

        await cache.set(`user_uid:${ctx.from.id}`, uid);
        await ctx.reply(I18N.AUTH.BIND_SUCCESS.replace('{uid}', uid), { parse_mode: 'HTML' });
        
        const data = await api.getPlayerDetail(uid);
        if (data) {
            profileStorage.saveProfile(uid, data);
            ctx.reply(renderPlayerInfo(data) + I18N.PLAYER_CENTER.DASHBOARD.SYNC_SUCCESS, {
                parse_mode: 'HTML',
                ...getMainMenuKeyboard(uid, data.characters)
            });
        }
    });

    bot.command('me', async (ctx) => {
        const { I18N } = getCfg();
        const uid = await cache.get(`user_uid:${ctx.from.id}`);
        if (!uid) return ctx.reply(I18N.AUTH.ME_NOT_BOUND, { parse_mode: 'HTML' });

        const cachedData = profileStorage.getProfile(uid);
        if (cachedData) {
            return ctx.reply(renderPlayerInfo(cachedData), {
                parse_mode: 'HTML',
                ...getMainMenuKeyboard(uid, cachedData.characters)
            });
        }

        await ctx.reply(I18N.COMMON.LOADING);
        const data = await api.getPlayerDetail(uid);
        if (data) {
            profileStorage.saveProfile(uid, data);
            ctx.reply(renderPlayerInfo(data), {
                parse_mode: 'HTML',
                ...getMainMenuKeyboard(uid, data.characters)
            });
        }
    });

    bot.action(/^sync_profile:(\d+)$/, async (ctx) => {
        const { I18N } = getCfg();
        const uid = ctx.match[1];
        await ctx.answerCbQuery(I18N.AUTH.UPDATE_SYNCING).catch(() => {});

        const data = await api.getPlayerDetail(uid, true);
        if (data) {
            profileStorage.saveProfile(uid, data);
            const msg = renderPlayerInfo(data) + I18N.PLAYER_CENTER.DASHBOARD.SYNC_DONE;
            await ctx.editMessageText(msg, {
                parse_mode: 'HTML',
                ...getMainMenuKeyboard(uid, data.characters)
            }).catch(() => {});
        } else {
            await ctx.answerCbQuery(I18N.AUTH.UPDATE_FAILED, { show_alert: true }).catch(() => {});
        }
    });

    bot.action(/^showcase:(\d+)$/, async (ctx) => {
        const { I18N } = getCfg();
        const uid = ctx.match[1];
        const data = profileStorage.getProfile(uid);
        if (!data) return;

        await ctx.editMessageText(I18N.CHAR_PANEL.SHOWCASE_TITLE.replace('{uid}', uid), {
            parse_mode: 'HTML',
            ...getShowcaseKeyboard(uid, data.characters)
        }).catch(() => {});
    });

    bot.action(/^profile:([1-9]\d{8}):(\d+)$/, async (ctx) => {
        const { I18N, CONST } = getCfg();
        const [_, uid, charId] = ctx.match;
        const data = profileStorage.getProfile(uid);
        const char = data?.characters.find(c => c.id == charId);
        if (!char) return;

        const T = I18N.CHAR_PANEL.DETAIL;
        let msg = T.TITLE
            .replace('{name}', esc(getDisplayCharName(char)))
            .replace('{level}', char.level)
            .replace('{rank}', char.rank)
            .replace('{path}', char.path.name)
            .replace('{element}', char.element.name);

        if (char.light_cone) {
            msg += T.LIGHTCONE
                .replace('{name}', esc(char.light_cone.name))
                .replace('{rank}', char.light_cone.rank);
        }

        if (char.relics && char.relics.length > 0) {
            msg += `─`.repeat(22) + `\n`;
            let totalV = 0;
            const { SETTINGS } = getCfg();
            const logicName = getLogicCharName(char);

            char.relics.forEach(r => {
                const { subStats, validRolls, mainStat } = getRelicAnalysis(r, logicName);
                totalV += parseFloat(validRolls);
                
                msg += T.RELIC_MAIN
                    .replace('{slot}', SETTINGS.PROFILE_UI.slots[r.slot])
                    .replace('{set}', r.set_name)
                    .replace('{main}', mainStat.name)
                    .replace('{val}', mainStat.value)
                    .replace('{v}', validRolls);

                r.sub_stats.forEach(sub => {
                    const isV = subStats.some(s => s.name === sub.name);
                    msg += T.RELIC_SUB
                        .replace('{prefix}', isV ? '<b>├</b> ' : '│ ')
                        .replace('{name}', sub.name)
                        .replace('{val}', sub.value)
                        .replace('{mark}', isV ? '✅' : '')
                        .replace('{cont}', isV ? `<code>${sub.value}</code>` : '');
                });
            });

            const v = parseFloat(totalV);
            const rating = v >= 35 ? "极品" : v >= 30 ? "优秀" : v >= 24 ? "合格" : "稍逊";

            msg += T.SCORE_FOOTER
                .replace('{total}', totalV.toFixed(1))
                .replace('{rating}', rating)
                .replace('{weights}', getWeightsForChar(logicName));
        }
        msg += `</code>`;

        await ctx.editMessageText(msg, {
            parse_mode: 'HTML',
            reply_markup: getShowcaseKeyboard(uid, data.characters).reply_markup
        }).catch(() => {});
    });
};

module.exports = { setupProfileHandlers, renderPlayerInfo, getMainMenuKeyboard };
