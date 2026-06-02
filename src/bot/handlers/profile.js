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

// 动态加载 UI 配置
const getUiCfg = () => loadModule(path.join(process.cwd(), 'config/ui-config.js'));

function esc(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function shortName(name) {
    const { STATS } = getUiCfg();
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
    const { PROFILE, STATS } = getUiCfg();
    let max = { name: '增伤', total: 0, base: 0, add: 0 };
    
    PROFILE.dmg_bonus.forEach(id => {
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
 * 格式化角色名称 (处理主角/三月七的命途显示)
 */
function formatCharName(char) {
    const specialChars = ['开拓者', '三月七', '星', '穹'];
    if (specialChars.some(name => char.name.includes(name))) {
        return `${char.name} • ${char.path.name}`;
    }
    return char.name;
}

/**
 * 首页菜单 (主要功能模块 + 常用角色)
 */
const getMainMenuKeyboard = (uid, characters = []) => {
    const keyboard = [];
    
    // 1. 前 4 个常用角色 (2列)
    const quickChars = characters.slice(0, 4);
    for (let i = 0; i < quickChars.length; i += 2) {
        const row = quickChars.slice(i, i + 2).map(c => Markup.button.callback(formatCharName(c), `profile:${uid}:${c.id}`));
        keyboard.push(row);
    }

    // 2. 功能模块
    keyboard.push([
        Markup.button.callback('🎭 角色展柜', `me_showcase:${uid}`),
        Markup.button.callback('📊 抽卡统计', `gacha_pool:${uid}:11`)
    ]);
    
    keyboard.push([
        Markup.button.callback('🔄 更新玩家信息', `sync_data:${uid}`)
    ]);
    
    return Markup.inlineKeyboard(keyboard);
};

/**
 * 展柜列表 (角色选择)
 */
const getShowcaseKeyboard = (uid, characters) => {
    const buttons = characters.map(c => Markup.button.callback(formatCharName(c), `profile:${uid}:${c.id}`));
    const keyboard = [];
    for (let i = 0; i < buttons.length; i += 2) keyboard.push(buttons.slice(i, i + 2));
    keyboard.push([
        Markup.button.callback('🔄 更新数据', `sync_data:${uid}`),
        Markup.button.callback('🏠 个人中心', `me_main:${uid}`)
    ]);
    return Markup.inlineKeyboard(keyboard);
};

/**
 * 角色详情页菜单
 */
const getDetailKeyboard = (uid, charId) => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('🔄 更新数据', `sync_data:${uid}:${charId}`),
            Markup.button.callback('🏠 个人中心', `me_main:${uid}`)
        ]
    ]);
};

function renderPlayerInfo(data) {
    const { TEXT } = getUiCfg();
    let msg = TEXT.player.title;
    if (data._isPlaceholder) {
        msg += TEXT.player.queuing;
    } else if (data._isFallback) {
        msg += TEXT.player.fallback;
    }
    
    msg += TEXT.player.info
        .replace('{nickname}', esc(data.player.nickname))
        .replace('{uid}', data.player.uid)
        .replace('{level}', data.player.level)
        .replace('{achievement}', data.player.space_info.achievement_count)
        .replace('{avatar}', data.player.space_info.avatar_count);
    
    return msg;
}

// 提取 UID 的通用方法
async function resolveUid(ctx, allowBindFallback = true) {
    const text = ctx.message?.text || "";
    const args = text.trim().split(/\s+/);
    
    // 1. 如果有参数且参数格式错误
    if (args.length > 1) {
        const uid = args[1];
        if (/^[1-9]\d{8}$/.test(uid)) return uid;
        return { error: 'INVALID_FORMAT', input: uid };
    }

    // 2. 引用回复提取
    if (ctx.message?.reply_to_message?.text) {
        const replyText = ctx.message.reply_to_message.text;
        const match = replyText.match(/[1-9]\d{8}/);
        if (match) return match[0];
    }

    // 3. 绑定关系 (可选)
    if (allowBindFallback) {
        const boundUid = await cache.getBindUid(ctx.from.id);
        if (boundUid) return boundUid;
    }
    
    return null;
}

const setupProfileHandlers = (bot) => {
    // 绑定 UID
    bot.command('bind', async (ctx) => {
        const { TEXT } = getUiCfg();
        const args = ctx.message.text.trim().split(/\s+/);
        const uid = args[1];
        if (!uid || !/^[1-9]\d{8}$/.test(uid)) {
            return ctx.reply(TEXT.auth.bind_prompt, {
                parse_mode: 'HTML',
                reply_markup: Markup.forceReply().reply_markup
            });
        }

        // 1. 立即执行本地绑定并回复
        await cache.bindUid(ctx.from.id, uid);
        logger.done(`用户 ${ctx.from.id} 成功绑定 UID ${uid}`);
        
        const placeholder = api.getPlaceholderData(uid);
        
        await ctx.reply(TEXT.auth.bind_success.replace('{uid}', uid), {
            parse_mode: 'HTML'
        });

        const dashboardMsg = await ctx.reply(renderPlayerInfo(placeholder), {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(uid, [])
        });

        // 2. 后台异步更新数据
        (async () => {
            try {
                const data = await api.getPlayerDetail(uid, true);
                if (data && !data._isPlaceholder) {
                    profileStorage.saveProfile(uid, data);
                    logger.done(`UID ${uid} 数据后台同步成功`);
                    
                    // 同步成功，静默刷新面板
                    await ctx.telegram.editMessageText(
                        ctx.chat.id, 
                        dashboardMsg.message_id, 
                        null, 
                        renderPlayerInfo(data) + TEXT.player.sync_success,
                        {
                            parse_mode: 'HTML',
                            ...getMainMenuKeyboard(uid, data.characters)
                        }
                    ).catch(() => {});
                } else {
                    // 同步失败，仅在面板底部加个小提示
                    logger.warn(`UID ${uid} 数据后台同步失败`);
                    await ctx.telegram.editMessageText(
                        ctx.chat.id, 
                        dashboardMsg.message_id, 
                        null, 
                        renderPlayerInfo(placeholder) + TEXT.player.sync_failed_hint,
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

    // 强制更新 (仅限绑定用户)
    bot.command('update', async (ctx) => {
        const { TEXT } = getUiCfg();
        const uid = await cache.getBindUid(ctx.from.id);
        if (!uid) return ctx.reply(TEXT.auth.update_need_bind);
        
        await ctx.reply(TEXT.auth.update_syncing);
        const data = await api.getPlayerDetail(uid, true);
        if (data && !data._isPlaceholder) {
            profileStorage.saveProfile(uid, data);
            logger.done(`用户 ${ctx.from.id} 强制刷新 UID ${uid} 成功`);
            ctx.reply(TEXT.auth.update_done);
        } else {
            logger.error(`用户 ${ctx.from.id} 强制刷新 UID ${uid} 失败`);
            ctx.reply(TEXT.auth.update_failed);
        }
    });

    // /me 个人数据中心
    bot.command('me', async (ctx) => {
        const { TEXT } = getUiCfg();
        const uid = await cache.getBindUid(ctx.from.id);
        if (!uid) {
            return ctx.reply(TEXT.auth.me_not_bound, {
                parse_mode: 'HTML',
                reply_markup: Markup.forceReply().reply_markup
            });
        }

        const data = await api.getPlayerDetail(uid);
        if (!data) return ctx.reply(TEXT.common.error_api);

        // 绑定用户自动持久化
        profileStorage.saveProfile(uid, data);
        await ctx.reply(renderPlayerInfo(data), {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(uid, data.characters)
        });
    });

    // 处理 Action: 返回首页
    bot.action(/^me_main:([1-9]\d{8})$/, async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const uid = ctx.match[1];
        const data = await api.getPlayerDetail(uid);
        
        await ctx.editMessageText(renderPlayerInfo(data), {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(uid, data.characters)
        }).catch(() => {});
    });

    // 处理 Action: 进入展柜角色列表
    bot.action(/^me_showcase:([1-9]\d{8})$/, async (ctx) => {
        const { TEXT } = getUiCfg();
        await ctx.answerCbQuery().catch(() => {});
        const uid = ctx.match[1];
        const data = await api.getPlayerDetail(uid);

        let msg = TEXT.profile.showcase_title.replace('{uid}', uid);
        
        await ctx.editMessageText(msg, {
            parse_mode: 'HTML',
            ...getShowcaseKeyboard(uid, data.characters)
        }).catch(() => {});
    });

    // /profile [UID] 查询面板
    bot.command('profile', async (ctx) => {
        const { TEXT } = getUiCfg();
        const uidResult = await resolveUid(ctx, false); // 不再猜测绑定 UID
        if (!uidResult) {
            return ctx.reply(TEXT.profile.prompt, {
                parse_mode: 'HTML',
                reply_markup: Markup.forceReply().reply_markup
            });
        }

        // 输入了参数但格式错误 (拦截错误对象)
        if (typeof uidResult === 'object' && uidResult.error === 'INVALID_FORMAT') {
            return ctx.reply(TEXT.profile.invalid_uid.replace('{input}', esc(uidResult.input)), {
                parse_mode: 'HTML'
            });
        }

        const uid = uidResult; // 校验通过，确认为安全的纯字符串 UID

        // 获取数据 (优先读缓存)
        const data = await api.getPlayerDetail(uid);

        // 检查是否是本人的绑定 UID，若是则同步到硬盘
        const boundUid = await cache.getBindUid(ctx.from.id);
        if (boundUid === uid && !data._isPlaceholder) profileStorage.saveProfile(uid, data);

        let msg = TEXT.profile.search_res
            .replace('{nickname}', esc(data.player.nickname))
            .replace('{uid}', uid);

        if (data._isPlaceholder) {
            msg += TEXT.profile.search_queuing;
        } else if (data._isFallback) {
            msg += TEXT.profile.search_fallback;
        }
        msg += TEXT.profile.search_footer;

        await ctx.reply(msg, {
            parse_mode: 'HTML',
            ...getShowcaseKeyboard(uid, data.characters)
        });
    });

    // 处理角色详情 Action
    bot.action(/^profile:([1-9]\d{8}):(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const [_, uid, charId] = ctx.match;
        const data = await api.getPlayerDetail(uid);
        const char = data.characters?.find(c => c.id == charId);
        if (!char) return;

        const uiCfg = getUiCfg();
        const { TEXT, PROFILE, STATS } = uiCfg;

        let msg = TEXT.char.detail_title
            .replace('{name}', esc(formatCharName(char)))
            .replace('{level}', char.level)
            .replace('{rank}', char.rank)
            .replace('{path}', char.path.name)
            .replace('{element}', char.element.name);

        const lc = char.light_cone;
        if (lc) {
            msg += TEXT.char.lc_title.replace('{name}', esc(lc.name)).replace('{rank}', lc.rank);
            msg += `<code>`;
            const lcAttrs = (lc.attributes || []).map(a => {
                const statCfg = STATS[a.field] || [a.field, a.field.slice(0, 1)];
                return `${statCfg[1]}: ${a.value.toFixed(0).padEnd(5)}`; 
            }).join(' ');
            msg += `${lcAttrs}\n</code>效果: ${esc(getWeaponDesc(lc.id, lc.rank))}\n\n`;
        }

        msg += `<code>`;
        
        PROFILE.main.forEach(id => {
            const res = getStatParts(char, id, ['crit_rate', 'crit_dmg'].includes(id));
            msg += `${STATS[id][1]}: ${res.t.padEnd(8)} (${res.p})\n`;
        });
        
        PROFILE.other.forEach(id => {
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

        if (char.relics && char.relics.length > 0) {
            msg += `─`.repeat(22) + `\n`;
            let totalV = 0;
            char.relics.forEach(r => {
                const { subStats, validRolls } = getRelicAnalysis(r, char.name);
                totalV += parseFloat(validRolls);
                const mName = shortName(r.main_affix.name);

                msg += TEXT.char.relic_title
                    .replace('{slot}', PROFILE.slots[r.type])
                    .replace('{set}', esc(r.set_name))
                    .replace('{main}', mName)
                    .replace('{val}', r.main_affix.display)
                    .replace('{v}', validRolls);

                subStats.forEach((s, idx) => {
                    const prefix = (idx === subStats.length - 1) ? '└ ' : '├ ';
                    msg += TEXT.char.relic_sub
                        .replace('{prefix}', prefix)
                        .replace('{name}', s.name.padEnd(4))
                        .replace('{val}', s.value.padEnd(7))
                        .replace('{mark}', s.rollMark)
                        .replace('{cont}', s.contribution !== "-" ? s.contribution : '-');
                });
            });

            const v = parseFloat(totalV);
            const rating = v >= 35 ? "极品" : v >= 30 ? "优秀" : v >= 24 ? "合格" : "稍逊";
            msg += TEXT.char.score_footer
                .replace('{total}', totalV.toFixed(1))
                .replace('{rating}', rating)
                .replace('{weights}', getWeightsForChar(char.name));
        }
        msg += `</code>`;

        try {
            await ctx.editMessageText(msg, { 
                parse_mode: 'HTML', 
                ...getShowcaseKeyboard(uid, data.characters) 
            });
        } catch (e) { if (!e.message.includes('not modified')) logger.error('编辑角色详情消息失败', e.message); }
    });

    // 处理 Action: 同步数据 (刷新)
    bot.action(/^sync_data:([1-9]\d{8})(?::(\d+))?$/, async (ctx) => {
        const { TEXT } = getUiCfg();
        await ctx.answerCbQuery('🔄 正在同步远程数据...').catch(() => {});
        const uid = ctx.match[1];
        const charId = ctx.match[2]; // 可能不存在
        
        const data = await api.getPlayerDetail(uid, true);
        if (!data) {
            return ctx.reply(TEXT.player.sync_failed_all, { parse_mode: 'HTML' });
        }

        const boundUid = await cache.getBindUid(ctx.from.id);
        if (boundUid === uid) profileStorage.saveProfile(uid, data);

        if (charId) {
            // 如果是从角色详情页发起的，刷新后重新触发该角色的 Action
            ctx.match = [null, uid, charId];
            return bot.handleUpdate(ctx.update); 
        } else {
            let msg = renderPlayerInfo(data);
            if (data._isFallback) {
                msg += TEXT.player.sync_back_fallback;
            } else {
                msg += TEXT.player.sync_done;
            }
            // 如果是从中心发起的，刷新后回到中心
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
