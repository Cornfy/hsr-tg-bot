// src/bot/handlers/profile.js
const { Markup } = require('telegraf');
const api = require('../../api/mihomo-api');
const cache = require('../../cache');
const profileStorage = require('../../utils/profile-storage');
const logger = require('../../utils/logger');
const { getRelicAnalysis, getWeightsForChar } = require('../../utils/relic-scorer');
const { getWeaponDesc } = require('../../utils/meta');
const path = require('path');
const { loadModule } = require('../../utils/loader');

/**
 * 获取最新的配置 (支持游戏分库)
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {Object} 包含统计信息、国际化、UI 配置和角色规则的配置对象
 */
const getCfg = (gameCode = 'HSR') => {
    const constants = loadModule(path.join(process.cwd(), 'config/game-constants.js'));
    const i18n = loadModule(path.join(process.cwd(), 'config/bot-i18n.js'));
    const settings = loadModule(path.join(process.cwd(), 'config/app-settings.js'));
    
    const gameConstants = constants[gameCode] || constants.HSR;
    const gameSettings = settings[gameCode] || settings.HSR;

    return {
        STATS: gameConstants.STATS,
        I18N: i18n.I18N,
        PROFILE_UI: gameSettings.PROFILE_UI,
        CHAR_RULES: gameSettings.CHAR_RULES
    };
};

/**
 * 转义文本以支持 HTML 解析
 * @param {string} text - 待转义文本
 * @returns {string} 转义后的 HTML 安全文本
 */
function esc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 将全名转换为简写（用于UI对齐）
 * @param {string} name - 属性全名
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {string} 属性简写
 */
function shortName(name, gameCode = 'HSR') {
    if (!name) return '';
    const { STATS } = getCfg(gameCode);
    let res = name;
    Object.values(STATS).forEach(([full, short]) => {
        res = res.replace(new RegExp(full, 'g'), short);
    });
    return res;
}

/**
 * 格式化数值，正数添加 + 号
 * @param {number} num - 数值
 * @returns {string} 格式化后的字符串
 */
function format(num) {
    return num > 0 ? `+${num}` : num;
}

/**
 * 获取属性的数值展示 (Base + Addition)
 * @param {Object} char - 角色数据对象
 * @param {string} field - 属性字段 ID
 * @param {boolean} [isPct=false] - 是否为百分比数值
 * @returns {Object} 包含展示值(t)和详情(p)的对象
 */
function getStatParts(char, field, isPct = false) {
    const base = char.attributes?.find(a => a.field === field)?.value || 0;
    const add = char.additions?.find(a => a.field === field)?.value || 0;
    return { t: (isPct ? ((base + add) * 100).toFixed(1) + "%" : (base + add).toFixed(1)), p: `${format(base)} +${format(add)}` };
}

/**
 * 获取角色属性增伤数据
 * @param {Object} char - 角色数据对象
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {Object} 增伤统计数据
 */
function getDmgBonusData(char, gameCode = 'HSR') {
    const { PROFILE_UI, STATS } = getCfg(gameCode);
    let max = { name: '增伤', total: 0, base: 0, add: 0 };
    
    PROFILE_UI.dmg_bonus.forEach(id => {
        const b = char.attributes?.find(a => a.field === id)?.value || 0;
        const a = char.additions?.find(a => a.field === id)?.value || 0;
        if (b + a > max.total) {
            max = { name: STATS[id][1], total: b + a, base: b, add: a };
        }
    });

    const allB = char.attributes?.find(a => a.field === 'all_dmg')?.value || 0;
    const allA = char.additions?.find(a => a.field === 'all_dmg')?.value || 0;
    max.total += (allB + allA); max.base += allB; max.add += allA;
    return { n: max.name, t: (max.total * 100).toFixed(1) + "%", p: `${format(max.base)} +${format(max.add)}` };
}

/**
 * 获取特殊角色前端 UI 展示名称 (用于按钮、面板标题)
 * @param {Object} char - 角色对象
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {string} 展示名称
 */
function getDisplayCharName(char, gameCode = 'HSR') {
    const { CHAR_RULES } = getCfg(gameCode);
    const id = String(char.id);
    
    if (CHAR_RULES.trailblazer_prefix && id.startsWith(CHAR_RULES.trailblazer_prefix)) {
        const isFemale = parseInt(id, 10) % 2 === 0;
        const baseName = isFemale ? CHAR_RULES.trailblazer_ui.female : CHAR_RULES.trailblazer_ui.male;
        return `${baseName} • ${char.path?.name || ''}`;
    }

    if (CHAR_RULES.multi_path_names?.includes(char.name)) {
        return `${char.name} • ${char.path?.name || ''}`;
    }

    return char.name;
}

/**
 * 获取特殊角色后端 logic 名称 (用于遗器评分、权重文件匹配)
 * @param {Object} char - 角色对象
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {string} 逻辑名称
 */
function getLogicCharName(char, gameCode = 'HSR') {
    const { CHAR_RULES } = getCfg(gameCode);
    const id = String(char.id);
    
    if (CHAR_RULES.trailblazer_prefix && id.startsWith(CHAR_RULES.trailblazer_prefix)) {
        return `开拓者•${char.path?.name || ''}`;
    }

    if (CHAR_RULES.multi_path_names?.includes(char.name)) {
        return `${char.name}•${char.path?.name || ''}`;
    }

    return char.name;
}

/**
 * 生成主面板菜单键盘
 * @param {string|number} uid - 用户UID
 * @param {Array} [characters=[]] - 角色列表
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {Object} Telegraf InlineKeyboard
 */
const getMainMenuKeyboard = (uid, characters = [], gameCode = 'HSR') => {
    const { I18N } = getCfg(gameCode);
    const keyboard = [];
    const quickChars = characters.slice(0, 3);
    for (let i = 0; i < quickChars.length; i += 3) {
        const row = quickChars.slice(i, i + 3).map(c => Markup.button.callback(getDisplayCharName(c, gameCode), `profile:${uid}:${c.id}`));
        keyboard.push(row);
    }

    keyboard.push([
        Markup.button.callback(I18N.PROFILE.KEYBOARD.SHOWCASE, `me_showcase:${uid}`),
        Markup.button.callback(I18N.PROFILE.KEYBOARD.GACHA_STATS, `gacha_pool:HSR:${uid}:11`)
    ]);
    keyboard.push([
        Markup.button.callback(I18N.PROFILE.KEYBOARD.SYNC, `sync_data:${uid}`)
    ]);

    return Markup.inlineKeyboard(keyboard);
};

/**
 * 生成角色展柜键盘
 * @param {string|number} uid - 用户UID
 * @param {Array} characters - 角色列表
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {Object} Telegraf InlineKeyboard
 */
const getShowcaseKeyboard = (uid, characters, gameCode = 'HSR') => {
    const { I18N } = getCfg(gameCode);
    const buttons = characters.map(c => Markup.button.callback(getDisplayCharName(c, gameCode), `profile:${uid}:${c.id}`));
    const keyboard = [];
    for (let i = 0; i < buttons.length; i += 2) keyboard.push(buttons.slice(i, i + 2));
    keyboard.push([
        Markup.button.callback(I18N.COMMON.KEYBOARD.BACK_TO_HOME, `back_to_me:${uid}`)
    ]);

    return Markup.inlineKeyboard(keyboard);
};

/**
 * 渲染玩家个人信息看板
 * @param {Object} data - 玩家详情数据
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {string} 格式化后的玩家信息 HTML 文案
 */
function renderPlayerInfo(data, gameCode = 'HSR') {
    const { I18N } = getCfg(gameCode);
    const T = I18N.PLAYER_CENTER.DASHBOARD;
    let msg = T.TITLE;
    if (data._isPlaceholder) {
        msg += T.QUEUING;
    } else if (data._isFallback) {
        msg += T.FALLBACK;
    }
    msg += T.INFO
        .replace('{nickname}', esc(data.player.nickname))
        .replace('{uid}', data.player.uid)
        .replace('{level}', data.player.level)
        .replace('{achievement}', data.player.space_info?.achievement_count || 0)
        .replace('{avatar}', data.player.space_info?.avatar_count || 0);
    return msg;
}

/**
 * 渲染角色详情文案 (核心业务逻辑，支持多游戏及本地测试复用)
 * @param {Object} char - 角色数据对象
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {string} 格式化后的角色详情 HTML 文案
 */
function renderCharacterDetail(char, gameCode = 'HSR') {
    const { I18N, PROFILE_UI, STATS } = getCfg(gameCode);
    const T = I18N.CHAR_PANEL.DETAIL;

    let msg = T.TITLE
        .replace('{name}', esc(getDisplayCharName(char, gameCode)))
        .replace('{level}', char.level)
        .replace('{rank}', char.rank)
        .replace('{path}', char.path.name)
        .replace('{element}', char.element.name);

    const lc = char.light_cone;
    if (lc) {
        msg += T.LIGHTCONE.replace('{name}', esc(lc.name)).replace('{rank}', lc.rank);
        msg += `<code>`;
        const lcAttrs = (lc.attributes || []).map(a => {
            const statCfg = STATS[a.field] || [a.field, a.field.slice(0, 1)];
            return `${statCfg[1]}: ${a.value.toFixed(0).padEnd(5)}`; 
        }).join('  ');
        msg += `${lcAttrs}\n</code>效果: ${esc(getWeaponDesc(lc.id, lc.rank))}\n\n`;
    }

    msg += `<code>`;
    PROFILE_UI.main.forEach(id => {
        const res = getStatParts(char, id, ['crit_rate', 'crit_dmg'].includes(id));
        msg += `${STATS[id][1]}: ${res.t.padEnd(8)} (${res.p})\n`;
    });

    PROFILE_UI.other.forEach(id => {
        let res, name;
        if (id === 'all_dmg') {
            const dmg = getDmgBonusData(char, gameCode);
            res = { t: dmg.t, p: dmg.p };
            name = dmg.n;
        } else {
            res = getStatParts(char, id, true);
            name = STATS[id][1];
        }
        msg += `${name}: ${res.t.padEnd(8)} (${res.p})\n`;
    });

    if (char.relics && char.relics.length > 0) {
        msg += `──────────────────────\n\n`;
        let totalV = 0;
        const logicName = getLogicCharName(char, gameCode);

        char.relics.forEach(r => {
            const { subStats, validRolls } = getRelicAnalysis(r, logicName);
            totalV += parseFloat(validRolls);
            const mName = shortName(r.main_affix.name, gameCode);

            msg += T.RELIC_MAIN
                .replace('{slot}', PROFILE_UI.slots[r.type] || r.type)
                .replace('{set}', esc(r.set_name))
                .replace('{main}', mName)
                .replace('{val}', r.main_affix.display)
                .replace('{v}', validRolls);

            subStats.forEach((s, idx) => {
                const prefix = (idx === subStats.length - 1) ? '└ ' : '├ ';
                const contText = s.contribution !== "-" ? `${s.contribution}v` : "-";

                msg += T.RELIC_SUB
                    .replace('{prefix}', prefix)
                    .replace('{name}', (s.name || '').padEnd(4))
                    .replace('{val}', (s.value || '').padEnd(7))
                    .replace('{mark}', (s.rollMark || '').padEnd(6))
                    .replace('{cont}', contText);
            });
        });

        msg += `\n──────────────────────`;
        const v = parseFloat(totalV);
        const rating = v >= 35 ? "极品" : v >= 30 ? "优秀" : v >= 24 ? "合格" : "稍逊";
        msg += T.SCORE_FOOTER
            .replace('{total}', totalV.toFixed(1))
            .replace('{rating}', rating)
            .replace('{weights}', getWeightsForChar(logicName));
    }
    msg += `</code>`;
    return msg;
}

/**
 * 通用 UID 解析器
 * @param {Object} ctx - Telegraf 上下文
 * @param {boolean} [allowBindFallback=true] - 是否允许从缓存回退绑定信息
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {Promise<string|null>} 解析出的 UID 或 null
 */
async function resolveUid(ctx, allowBindFallback = true, gameCode = 'HSR') {
    const text = ctx.message?.text || "";
    const args = text.trim().split(/\s+/);
    if (args.length > 1 && /^[1-9]\d{8}$/.test(args[1])) {
        return args[1];
    }
    if (allowBindFallback) {
        const boundUid = await cache.getBindUid(ctx.from.id, gameCode);
        if (boundUid) return boundUid;
    }
    return null;
}

/**
 * 初始化角色面板处理流程
 * @param {Object} bot - Telegraf 实例
 */
const setupProfileHandlers = (bot) => {
    bot.command('bind', async (ctx) => {
        const gameCode = 'HSR';
        const { I18N } = getCfg(gameCode);
        const args = ctx.message.text.trim().split(/\s+/);
        const uid = args[1];
        if (!uid || !/^[1-9]\d{8}$/.test(uid)) {
            return ctx.reply(I18N.AUTH.BIND_PROMPT, {
                parse_mode: 'HTML',
                reply_markup: Markup.forceReply().reply_markup
            });
        }
        await cache.bindUid(ctx.from.id, uid, gameCode);
        logger.done(`用户 ${ctx.from.id} 成功绑定 UID ${uid} [${gameCode}]`);
        const placeholder = api.getPlaceholderData(uid);
        await ctx.reply(`正在绑定 UID ${uid}...`, { parse_mode: 'HTML' });
        const dashboardMsg = await ctx.reply(renderPlayerInfo(placeholder, gameCode), {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(uid, [], gameCode)
        });
        (async () => {
            try {
                const data = await api.getPlayerDetail(uid, true, gameCode);
                if (data && !data._isPlaceholder) {
                    profileStorage.saveProfile(uid, data, gameCode);
                    logger.done(`UID ${uid} 数据后台同步成功`);
                    await ctx.telegram.editMessageText(ctx.chat.id, dashboardMsg.message_id, null, renderPlayerInfo(data, gameCode) + I18N.PLAYER_CENTER.DASHBOARD.SYNC_SUCCESS, {
                        parse_mode: 'HTML',
                        ...getMainMenuKeyboard(uid, data.characters, gameCode)
                    }).catch(() => {});
                }
            } catch (e) {
                logger.error('数据后台同步失败', e);
                await ctx.telegram.editMessageText(ctx.chat.id, dashboardMsg.message_id, null, renderPlayerInfo(placeholder, gameCode) + I18N.PLAYER_CENTER.DASHBOARD.SYNC_FAILED_HINT, {
                    parse_mode: 'HTML',
                    ...getMainMenuKeyboard(uid, [], gameCode)
                }).catch(() => {});
            }
        })();
    });

    bot.command('update', async (ctx) => {
        const gameCode = 'HSR';
        const { I18N } = getCfg(gameCode);
        const uid = await cache.getBindUid(ctx.from.id, gameCode);
        if (!uid) return ctx.reply(I18N.AUTH.UPDATE_NEED_BIND);
        await ctx.reply(I18N.AUTH.UPDATE_SYNCING);
        const data = await api.getPlayerDetail(uid, true, gameCode);
        if (data && !data._isPlaceholder) {
            profileStorage.saveProfile(uid, data, gameCode);
            logger.done(`用户 ${ctx.from.id} 强制刷新 UID ${uid} 成功`);
            ctx.reply(I18N.AUTH.UPDATE_DONE);
        } else {
            ctx.reply(I18N.AUTH.UPDATE_FAILED);
        }
    });

    bot.command('me', async (ctx) => {
        const gameCode = 'HSR';
        const { I18N } = getCfg(gameCode);
        const uid = await cache.getBindUid(ctx.from.id, gameCode);
        if (!uid) {
            return ctx.reply(I18N.AUTH.ME_NOT_BOUND, {
                parse_mode: 'HTML',
                reply_markup: Markup.forceReply().reply_markup
            });
        }
        const data = await api.getPlayerDetail(uid, false, gameCode);
        if (!data) return ctx.reply(I18N.COMMON.ERROR_API);
        profileStorage.saveProfile(uid, data, gameCode);
        await ctx.reply(renderPlayerInfo(data, gameCode), {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(uid, data.characters, gameCode)
        });
    });

    bot.action(/^me_main:([1-9]\d{8})$/, async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const uid = ctx.match[1];
        const gameCode = 'HSR';
        const data = await api.getPlayerDetail(uid, false, gameCode);
        await ctx.editMessageText(renderPlayerInfo(data, gameCode), {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(uid, data.characters, gameCode)
        }).catch(() => {});
    });

    bot.action(/^me_showcase:([1-9]\d{8})$/, async (ctx) => {
        const gameCode = 'HSR';
        const { I18N } = getCfg(gameCode);
        await ctx.answerCbQuery().catch(() => {});
        const uid = ctx.match[1];
        const data = await api.getPlayerDetail(uid, false, gameCode);
        let msg = I18N.CHAR_PANEL.SHOWCASE_TITLE.replace('{uid}', uid);
        await ctx.editMessageText(msg, {
            parse_mode: 'HTML',
            ...getShowcaseKeyboard(uid, data.characters, gameCode)
        }).catch(() => {});
    });

    bot.command('profile', async (ctx) => {
        const gameCode = 'HSR';
        const { I18N } = getCfg(gameCode);
        const uidResult = await resolveUid(ctx, false, gameCode);
        if (!uidResult) {
            return ctx.reply(I18N.CHAR_PANEL.PROMPT, {
                parse_mode: 'HTML',
                reply_markup: Markup.forceReply().reply_markup
            });
        }
        const uid = uidResult;
        const data = await api.getPlayerDetail(uid, false, gameCode);
        const boundUid = await cache.getBindUid(ctx.from.id, gameCode);
        if (boundUid === uid && !data._isPlaceholder) profileStorage.saveProfile(uid, data, gameCode);
        let msg = I18N.CHAR_PANEL.SEARCH_RES
            .replace('{nickname}', esc(data.player.nickname))
            .replace('{uid}', uid);
        msg += renderCharacterDetail(data.characters[0], gameCode);
        await ctx.reply(msg, {
            parse_mode: 'HTML',
            ...getShowcaseKeyboard(uid, data.characters, gameCode)
        });
    });

    bot.action(/^profile:([1-9]\d{8}):(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const [_, uid, charId] = ctx.match;
        const gameCode = 'HSR';
        const data = profileStorage.getProfile(uid, gameCode); 
        const char = data?.characters.find(c => c.id == charId);
        if (!char) return;
        const msg = renderCharacterDetail(char, gameCode);
        try {
            await ctx.editMessageText(msg, { 
                parse_mode: 'HTML',
                ...getShowcaseKeyboard(uid, data.characters, gameCode)
            });
        } catch (e) { if (!e.message.includes('not modified')) logger.error('编辑角色详情消息失败', e.message); }
    });

    bot.action(/^sync_data:([1-9]\d{8})(?::(\d+))?$/, async (ctx) => {
        const gameCode = 'HSR';
        const { I18N } = getCfg(gameCode);
        const T = I18N.PLAYER_CENTER.DASHBOARD;
        const uid = ctx.match[1];
        const charId = ctx.match[2];
        await ctx.editMessageText(T.TITLE + T.QUEUING + T.SYNC_IN_PROGRESS, { parse_mode: 'HTML' }).catch(() => {});
        const data = await api.getPlayerDetail(uid, true, gameCode);
        if (!data) return ctx.reply(I18N.COMMON.ERROR_API, { parse_mode: 'HTML' });
        const boundUid = await cache.getBindUid(ctx.from.id, gameCode);
        if (boundUid === uid) profileStorage.saveProfile(uid, data, gameCode);
        if (charId) {
            ctx.match = [null, uid, charId];
            return bot.handleUpdate(ctx.update); 
        } else {
            let msg = renderPlayerInfo(data, gameCode);
            msg += data._isFallback ? I18N.PLAYER_CENTER.DASHBOARD.SYNC_BACK_FALLBACK : I18N.PLAYER_CENTER.DASHBOARD.SYNC_SUCCESS;
            await ctx.editMessageText(msg, {
                parse_mode: 'HTML',
                ...getMainMenuKeyboard(uid, data.characters, gameCode)
            }).catch(() => {});
        }
    });
};

module.exports = { 
    setupProfileHandlers,
    renderPlayerInfo,
    renderCharacterDetail,
    getMainMenuKeyboard,
    getShowcaseKeyboard,
    resolveUid
};
