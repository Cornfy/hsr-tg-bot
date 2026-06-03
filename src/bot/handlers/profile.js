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

// 统一动态加载全新拆分后的三大配置文件
const getCfg = () => {
    const constants = loadModule(path.join(process.cwd(), 'config/game-constants.js'));
    const i18n = loadModule(path.join(process.cwd(), 'config/bot-i18n.js'));
    const settings = loadModule(path.join(process.cwd(), 'config/app-settings.js'));
    return {
        STATS: constants.STATS,
        I18N: i18n.I18N,
        PROFILE_UI: settings.PROFILE_UI,
        CHAR_RULES: settings.CHAR_RULES
    };
};

function esc(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 恢复原汁原味的 shortName 全局函数
function shortName(name) {
    if (!name) return '';
    const { STATS } = getCfg();
    let res = name;
    Object.values(STATS).forEach(([full, short]) => {
        res = res.replace(new RegExp(full, 'g'), short);
    });
    return res;
}

function getStatParts(char, field, isPct = false) {
    const attribute = char.attributes?.find(a => a.field === field);
    const addition = char.additions?.find(a => a.field === field);
    let base = attribute ? attribute.value : 0;
    const add = addition ? addition.value : 0;

    // 能量恢复效率基础为 100% (1.0)
    if (field === 'sp_rate' && base === 0) base = 1.0;

    const format = (val) => (isPct ? (val * 100).toFixed(1) : val.toFixed(1)).padStart(7);
    return { t: (isPct ? ((base + add) * 100).toFixed(1) + "%" : (base + add).toFixed(1)), p: `${format(base)} +${format(add)}` };
}

function getDmgBonusData(char) {
    const { PROFILE_UI, STATS } = getCfg();
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
    const format = (val) => (val * 100).toFixed(1).padStart(7);
    return { n: max.name, t: (max.total * 100).toFixed(1) + "%", p: `${format(max.base)} +${format(max.add)}` };
}

/**
 * 获取特殊角色前端 UI 展示名称 (用于按钮、面板标题)
 */
function getDisplayCharName(char) {
    const { CHAR_RULES } = getCfg();
    const id = String(char.id);
    
    if (id.startsWith(CHAR_RULES.trailblazer_prefix)) {
        const isFemale = parseInt(id, 10) % 2 === 0;
        const baseName = isFemale ? CHAR_RULES.trailblazer_ui.female : CHAR_RULES.trailblazer_ui.male;
        return `${baseName} • ${char.path?.name || ''}`;
    }

    if (CHAR_RULES.multi_path_names.includes(char.name)) {
        return `${char.name} • ${char.path?.name || ''}`;
    }

    return char.name;
}

/**
 * 获取特殊角色后端逻辑名称 (用于遗器评分、权重文件匹配)
 */
function getLogicCharName(char) {
    const { CHAR_RULES } = getCfg();
    const id = String(char.id);
    
    if (id.startsWith(CHAR_RULES.trailblazer_prefix)) {
        return `开拓者•${char.path?.name || ''}`;
    }

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
    const quickChars = characters.slice(0, 3);
    for (let i = 0; i < quickChars.length; i += 3) {
        const row = quickChars.slice(i, i + 3).map(c => Markup.button.callback(getDisplayCharName(c), `profile:${uid}:${c.id}`));
        keyboard.push(row);
    }

    keyboard.push([
        Markup.button.callback('🎭 角色展柜', `me_showcase:${uid}`),
        Markup.button.callback('📊 抽卡统计', `gacha_pool:HSR:${uid}:11`)
    ]);
    keyboard.push([
        Markup.button.callback('🔄 更新玩家信息', `sync_data:${uid}`)
    ]);

    return Markup.inlineKeyboard(keyboard);
};

const getShowcaseKeyboard = (uid, characters) => {
    const buttons = characters.map(c => Markup.button.callback(getDisplayCharName(c), `profile:${uid}:${c.id}`));
    const keyboard = [];
    for (let i = 0; i < buttons.length; i += 2) keyboard.push(buttons.slice(i, i + 2));
    keyboard.push([
        Markup.button.callback('⬅️ 返回主页', `back_to_me:${uid}`)
    ]);

    return Markup.inlineKeyboard(keyboard);
};

function renderPlayerInfo(data) {
    const { I18N } = getCfg();
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

// 提取 UID 的通用方法
async function resolveUid(ctx, allowBindFallback = true) {
    const text = ctx.message?.text || "";
    const args = text.trim().split(/\s+/);

    if (args.length > 1) {
        const uid = args[1];
        if (/^[1-9]\d{8}$/.test(uid)) return uid;
        return { error: 'INVALID_FORMAT', input: uid };
    }

    if (ctx.message?.reply_to_message?.text) {
        const replyText = ctx.message.reply_to_message.text;
        const match = replyText.match(/[1-9]\d{8}/);
        if (match) return match[0];
    }

    if (allowBindFallback) {
        const boundUid = await cache.getBindUid(ctx.from.id);
        if (boundUid) return boundUid;
    }

    return null;
}

const setupProfileHandlers = (bot) => {
    bot.command('bind', async (ctx) => {
        const { I18N } = getCfg();
        const args = ctx.message.text.trim().split(/\s+/);
        const uid = args[1];
        if (!uid || !/^[1-9]\d{8}$/.test(uid)) {
            return ctx.reply(I18N.AUTH.BIND_PROMPT, {
                parse_mode: 'HTML',
                reply_markup: Markup.forceReply().reply_markup
            });
        }

        await cache.bindUid(ctx.from.id, uid);
        logger.done(`用户 ${ctx.from.id} 成功绑定 UID ${uid}`);

        const placeholder = api.getPlaceholderData(uid);

        await ctx.reply(I18N.AUTH.BIND_SUCCESS.replace('{uid}', uid), {
            parse_mode: 'HTML'
        });

        const dashboardMsg = await ctx.reply(renderPlayerInfo(placeholder), {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(uid, [])
        });

        (async () => {
            try {
                const data = await api.getPlayerDetail(uid, true);
                if (data && !data._isPlaceholder) {
                    profileStorage.saveProfile(uid, data, 'HSR');
                    logger.done(`UID ${uid} 数据后台同步成功`);

                    await ctx.telegram.editMessageText(
                        ctx.chat.id, 
                        dashboardMsg.message_id, 
                        null, 
                        renderPlayerInfo(data) + I18N.PLAYER_CENTER.DASHBOARD.SYNC_SUCCESS,
                        {
                            parse_mode: 'HTML',
                            ...getMainMenuKeyboard(uid, data.characters)
                        }
                    ).catch(() => {});
                } else {
                    logger.warn(`UID ${uid} 数据后台同步失败`);
                    await ctx.telegram.editMessageText(
                        ctx.chat.id, 
                        dashboardMsg.message_id, 
                        null, 
                        renderPlayerInfo(placeholder) + I18N.PLAYER_CENTER.DASHBOARD.SYNC_FAILED_HINT,
                        {
                            parse_mode: 'HTML',
                            ...getMainMenuKeyboard(uid, [])
                        }
                    ).catch(() => {});
                }
            } catch (err) {
                logger.error(`UID ${uid} 后台同步发生异常`, err);
            }
        })();
    });

    bot.command('update', async (ctx) => {
        const { I18N } = getCfg();
        const uid = await cache.getBindUid(ctx.from.id);
        if (!uid) return ctx.reply(I18N.AUTH.UPDATE_NEED_BIND);

        await ctx.reply(I18N.AUTH.UPDATE_SYNCING);
        const data = await api.getPlayerDetail(uid, true);
        if (data && !data._isPlaceholder) {
            profileStorage.saveProfile(uid, data, 'HSR');
            logger.done(`用户 ${ctx.from.id} 强制刷新 UID ${uid} 成功`);
            ctx.reply(I18N.AUTH.UPDATE_DONE);
        } else {
            logger.error(`用户 ${ctx.from.id} 强制刷新 UID ${uid} 失败`);
            ctx.reply(I18N.AUTH.UPDATE_FAILED);
        }
    });

    bot.command('me', async (ctx) => {
        const { I18N } = getCfg();
        const uid = await cache.getBindUid(ctx.from.id);
        if (!uid) {
            return ctx.reply(I18N.AUTH.ME_NOT_BOUND, {
                parse_mode: 'HTML',
                reply_markup: Markup.forceReply().reply_markup
            });
        }

        const data = await api.getPlayerDetail(uid);
        if (!data) return ctx.reply(I18N.COMMON.ERROR_API);

        profileStorage.saveProfile(uid, data, 'HSR');
        await ctx.reply(renderPlayerInfo(data), {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(uid, data.characters)
        });
    });

    bot.action(/^me_main:([1-9]\d{8})$/, async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const uid = ctx.match[1];
        const data = await api.getPlayerDetail(uid);

        await ctx.editMessageText(renderPlayerInfo(data), {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(uid, data.characters)
        }).catch(() => {});
    });

    bot.action(/^me_showcase:([1-9]\d{8})$/, async (ctx) => {
        const { I18N } = getCfg();
        await ctx.answerCbQuery().catch(() => {});
        const uid = ctx.match[1];
        const data = await api.getPlayerDetail(uid);

        let msg = I18N.CHAR_PANEL.SHOWCASE_TITLE.replace('{uid}', uid);

        await ctx.editMessageText(msg, {
            parse_mode: 'HTML',
            ...getShowcaseKeyboard(uid, data.characters)
        }).catch(() => {});
    });

    bot.command('profile', async (ctx) => {
        const { I18N } = getCfg();
        const uidResult = await resolveUid(ctx, false);
        if (!uidResult) {
            return ctx.reply(I18N.CHAR_PANEL.PROMPT, {
                parse_mode: 'HTML',
                reply_markup: Markup.forceReply().reply_markup
            });
        }

        if (typeof uidResult === 'object' && uidResult.error === 'INVALID_FORMAT') {
            return ctx.reply(I18N.CHAR_PANEL.INVALID_UID.replace('{input}', esc(uidResult.input)), {
                parse_mode: 'HTML'
            });
        }

        const uid = uidResult;
        const data = await api.getPlayerDetail(uid);

        const boundUid = await cache.getBindUid(ctx.from.id);
        if (boundUid === uid && !data._isPlaceholder) profileStorage.saveProfile(uid, data, 'HSR');

        let msg = I18N.CHAR_PANEL.SEARCH_RES
            .replace('{nickname}', esc(data.player.nickname))
            .replace('{uid}', uid);

        if (data._isPlaceholder) {
            msg += I18N.PLAYER_CENTER.DASHBOARD.QUEUING;
        } else if (data._isFallback) {
            msg += I18N.PLAYER_CENTER.DASHBOARD.FALLBACK;
        }

        await ctx.reply(msg, {
            parse_mode: 'HTML',
            ...getShowcaseKeyboard(uid, data.characters)
        });
    });

    // 处理角色详情 Action
    bot.action(/^profile:([1-9]\d{8}):(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const [_, uid, charId] = ctx.match;
        const data = profileStorage.getProfile(uid, 'HSR'); // 优先从缓存取，保证快速响应
        const char = data?.characters.find(c => c.id == charId);
        if (!char) return;

        const { I18N, PROFILE_UI, STATS } = getCfg();
        const T = I18N.CHAR_PANEL.DETAIL;

        // 1. 标题
        let msg = T.TITLE
            .replace('{name}', esc(getDisplayCharName(char)))
            .replace('{level}', char.level)
            .replace('{rank}', char.rank)
            .replace('{path}', char.path.name)
            .replace('{element}', char.element.name);

        // 2. 光锥 (还原原本的排版结构，调用 meta.js)
        const lc = char.light_cone;
        if (lc) {
            msg += T.LIGHTCONE.replace('{name}', esc(lc.name)).replace('{rank}', lc.rank);
            // 确保在等宽环境中展示属性
            msg += `<code>`;
            const lcAttrs = (lc.attributes || []).map(a => {
                const statCfg = STATS[a.field] || [a.field, a.field.slice(0, 1)];
                return `${statCfg[1]}: ${a.value.toFixed(0).padEnd(5)}`; 
            }).join('  ');
            msg += `${lcAttrs}\n</code>效果: ${esc(getWeaponDesc(lc.id, lc.rank))}\n\n`;
        }

        // 3. 基础属性
        msg += `<code>`;
        PROFILE_UI.main.forEach(id => {
            const res = getStatParts(char, id, ['crit_rate', 'crit_dmg'].includes(id));
            msg += `${STATS[id][1]}: ${res.t.padEnd(8)} (${res.p})\n`;
        });

        PROFILE_UI.other.forEach(id => {
            let res, name;
            if (id === 'all_dmg') {
                const dmg = getDmgBonusData(char);
                res = { t: dmg.t, p: dmg.p };
                name = dmg.n;
            } else {
                res = getStatParts(char, id, true);
                name = STATS[id][1];
            }
            msg += `${name}: ${res.t.padEnd(8)} (${res.p})\n`;
        });

        // 4. 遗器区域
        if (char.relics && char.relics.length > 0) {
            msg += `──────────────────────\n\n`;
            let totalV = 0;
            const logicName = getLogicCharName(char);

            char.relics.forEach(r => {
                const { subStats, validRolls } = getRelicAnalysis(r, logicName);
                totalV += parseFloat(validRolls);
                const mName = shortName(r.main_affix.name);

                msg += T.RELIC_MAIN
                    .replace('{slot}', PROFILE_UI.slots[r.type] || r.type)
                    .replace('{set}', esc(r.set_name))
                    .replace('{main}', mName)
                    .replace('{val}', r.main_affix.display)
                    .replace('{v}', validRolls);

                subStats.forEach((s, idx) => {
                    const prefix = (idx === subStats.length - 1) ? '└ ' : '├ ';
                    // 因为你丢失了 relic_cont_value 模版，我直接帮你硬编码为完美的对齐文本
                    const contText = s.contribution !== "-" ? `${s.contribution}v` : "-";

                    msg += T.RELIC_SUB
                        .replace('{prefix}', prefix)
                        .replace('{name}', (s.name || '').padEnd(4))
                        .replace('{val}', (s.value || '').padEnd(7))
                        .replace('{mark}', (s.rollMark || '').padEnd(6)) // 确保 [2↑] 后面的空格对齐
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

        try {
            await ctx.editMessageText(msg, { 
                parse_mode: 'HTML', 
                ...getShowcaseKeyboard(uid, data.characters) 
            });
        } catch (e) { 
            if (!e.message.includes('not modified')) logger.error('编辑角色详情消息失败', e.message); 
        }
    });

    bot.action(/^sync_data:([1-9]\d{8})(?::(\d+))?$/, async (ctx) => {
        const { I18N } = getCfg();
        await ctx.answerCbQuery('🔄 正在同步远程数据...').catch(() => {});
        const uid = ctx.match[1];
        const charId = ctx.match[2];
        
        const data = await api.getPlayerDetail(uid, true);
        if (!data) {
            return ctx.reply(I18N.COMMON.ERROR_API, { parse_mode: 'HTML' });
        }

        const boundUid = await cache.getBindUid(ctx.from.id);
        if (boundUid === uid) profileStorage.saveProfile(uid, data, 'HSR');

        if (charId) {
            ctx.match = [null, uid, charId];
            return bot.handleUpdate(ctx.update); 
        } else {
            let msg = renderPlayerInfo(data);
            if (data._isFallback) {
                msg += I18N.PLAYER_CENTER.DASHBOARD.SYNC_BACK_FALLBACK;
            } else {
                msg += I18N.PLAYER_CENTER.DASHBOARD.SYNC_DONE;
            }
            await ctx.editMessageText(msg, {
                parse_mode: 'HTML',
                ...getMainMenuKeyboard(uid, data.characters)
            }).catch(() => {});
        }
    });
};

module.exports = { 
    setupProfileHandlers,
    renderPlayerInfo,
    getMainMenuKeyboard,
    resolveUid
};
