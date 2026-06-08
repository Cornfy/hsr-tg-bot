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
 * 合并新获取的角色列表与缓存的角色列表
 * @param {Array} freshChars - 最新获取的角色列表
 * @param {Array} cachedChars - 缓存的角色列表
 * @param {boolean} [isFreshData=true] - 是否为真实的远程最新数据
 * @returns {Array} 合并并去重后的角色列表
 */
function mergeCharacters(freshChars = [], cachedChars = [], isFreshData = true) {
    const charMap = new Map();
    
    // 1. 先将缓存中的角色全部存入 Map (保持其现有的 _isFresh 状态)
    cachedChars.forEach(c => {
        charMap.set(String(c.id), { ...c });
    });
    
    // 2. 如果不是来自远程的真实刷新（比如只是读取了本地缓存或占位符），则不更新在线状态，仅做简单的合并（去重）
    if (!isFreshData) {
        freshChars.forEach(c => {
            if (!charMap.has(String(c.id))) {
                charMap.set(String(c.id), { ...c });
            }
        });
        return Array.from(charMap.values());
    }

    // 3. 如果是真实的远程数据，我们需要全局更新“在线”状态
    // 第一步：先将 Map 中现有的所有角色标记为“非在线” (Archive)
    for (let c of charMap.values()) {
        c._isFresh = false;
    }

    // 第二步：将当前 API 返回的角色标记为“在线” (Fresh) 并覆盖更新数据
    freshChars.forEach(c => {
        charMap.set(String(c.id), { ...c, _isFresh: true });
    });
    
    return Array.from(charMap.values());
}

/**
 * 获取合并了缓存数据的玩家详情
 * @param {string|number} uid - 用户UID
 * @param {Object} [options={}] - 配置选项
 * @param {boolean} [options.force=false] - 是否强制更新
 * @param {string} [options.gameCode='HSR'] - 游戏代码
 * @param {boolean} [options.shouldSave=false] - 是否在获取到有效数据后保存至本地
 * @returns {Promise<Object>} 合并后的玩家数据
 */
async function getMergedData(uid, options = {}) {
    const { force = false, gameCode = 'HSR', shouldSave = false } = options;
    const data = await api.getPlayerDetail(uid, force, gameCode);
    if (!data) return null;
    
    const cachedData = profileStorage.getProfile(uid, gameCode);
    const cachedChars = (cachedData && cachedData.characters) ? cachedData.characters : [];
    const isFreshData = !data._isPlaceholder && !data._isFallback;

    if (data._isPlaceholder && cachedData && cachedData.player) {
        data.player = cachedData.player;
        data._isPlaceholder = false; 
        data._isFallback = true;
    }

    const mergedChars = mergeCharacters(data.characters || [], cachedChars, isFreshData);
    const mergedData = { ...data, characters: mergedChars };

    if (shouldSave && isFreshData && data.player?.nickname) {
        profileStorage.saveProfile(uid, mergedData, gameCode);
    }
    
    return mergedData;
}

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
 * 格式化数值，保留一位小数，并填充空格用于对齐
 * @param {number} num - 数值
 * @param {boolean} [isPct=false] - 是否为百分比
 * @returns {string} 格式化后的字符串
 */
function format(num, isPct = false) {
    return (isPct ? (num * 100) : num).toFixed(1).padStart(7);
}

/**
 * 获取属性的数值展示 (Base + Addition)
 * @param {Object} char - 角色数据对象
 * @param {string} field - 属性字段 ID
 * @param {boolean} [isPct=false] - 是否为百分比数值
 * @returns {Object} 包含展示值(totalDisplay)和详情(breakdownDisplay)的对象
 */
function getStatParts(char, field, isPct = false) {
    const baseValue = char.attributes?.find(a => a.field === field)?.value || 0;
    const additionValue = char.additions?.find(a => a.field === field)?.value || 0;
    return { 
        totalDisplay: (isPct ? ((baseValue + additionValue) * 100).toFixed(1) + "%" : (baseValue + additionValue).toFixed(1)), 
        breakdownDisplay: `${format(baseValue, isPct)} + ${format(additionValue, isPct)}` 
    };
}

/**
 * 获取角色属性增伤数据
 * @param {Object} char - 角色数据对象
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {Object} 增伤统计数据
 */
function getDmgBonusData(char, gameCode = 'HSR') {
    const { PROFILE_UI, STATS } = getCfg(gameCode);
    let maxDmgBonus = { name: '增伤', total: 0, baseValue: 0, additionValue: 0 };
    
    PROFILE_UI.dmg_bonus.forEach(id => {
        const baseValue = char.attributes?.find(a => a.field === id)?.value || 0;
        const additionValue = char.additions?.find(a => a.field === id)?.value || 0;
        if (baseValue + additionValue > maxDmgBonus.total) {
            maxDmgBonus = { name: STATS[id][1], total: baseValue + additionValue, baseValue, additionValue };
        }
    });

    const allDmgBase = char.attributes?.find(a => a.field === 'all_dmg')?.value || 0;
    const allDmgAddition = char.additions?.find(a => a.field === 'all_dmg')?.value || 0;
    maxDmgBonus.total += (allDmgBase + allDmgAddition);
    maxDmgBonus.baseValue += allDmgBase;
    maxDmgBonus.additionValue += allDmgAddition;
    
    return { 
        name: maxDmgBonus.name, 
        totalDisplay: (maxDmgBonus.total * 100).toFixed(1) + "%", 
        breakdownDisplay: `${format(maxDmgBonus.baseValue, true)} + ${format(maxDmgBonus.additionValue, true)}` 
    };
}

/**
 * 获取特殊角色前端 UI 展示名称 (用于按钮、面板标题)
 * @param {Object} char - 角色对象
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {string} 展示名称
 */
function getDisplayCharName(char, gameCode = 'HSR') {
    if (!char || !char.id) return "???";
    const { CHAR_RULES, I18N } = getCfg(gameCode);
    const id = String(char.id);
    
    let name = char.name;
    if (CHAR_RULES.trailblazer_prefix && id.startsWith(CHAR_RULES.trailblazer_prefix)) {
        const isFemale = parseInt(id, 10) % 2 === 0;
        const baseName = isFemale ? CHAR_RULES.trailblazer_ui.female : CHAR_RULES.trailblazer_ui.male;
        name = `${baseName} • ${char.path?.name || ''}`;
    } else if (CHAR_RULES.multi_path_names?.includes(char.name)) {
        name = `${char.name} • ${char.path?.name || ''}`;
    }

    // 如果是在线的最新角色，增加云图标标识
    if (char._isFresh === true) {
        name = (I18N.CHAR_PANEL.ONLINE_ICON || '') + name;
    }

    return name;
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
    
    // 主页快捷按钮仅显示“在线”的角色
    const freshChars = characters.filter(c => c._isFresh !== false).slice(0, 3);
    if (freshChars.length > 0) {
        const row = freshChars.map(c => Markup.button.callback(getDisplayCharName(c, gameCode), `profile:${uid}:${c.id}`));
        keyboard.push(row);
    }

    keyboard.push([
        Markup.button.callback(I18N.PROFILE.KEYBOARD.SHOWCASE, `me_showcase:${uid}`),
        Markup.button.callback(I18N.PROFILE.KEYBOARD.GACHA_STATS, `gacha_pool:HSR:${uid}:11`),
    ]);
    
    keyboard.push([
        Markup.button.callback(I18N.PROFILE.KEYBOARD.SYNC, `sync_data:${uid}`)
    ]);

    return Markup.inlineKeyboard(keyboard);
};

/**
 * 生成角色展柜键盘 (整合所有角色)
 * @param {string|number} uid - 用户UID
 * @param {Array} characters - 角色列表
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {Object} Telegraf InlineKeyboard
 */
const getShowcaseKeyboard = (uid, characters, gameCode = 'HSR') => {
    const { I18N } = getCfg(gameCode);
    // 按在线状态排序，在线角色在前
    const sortedChars = [...characters].sort((a, b) => (b._isFresh === true ? 1 : 0) - (a._isFresh === true ? 1 : 0));
    
    const buttons = sortedChars.map(c => Markup.button.callback(getDisplayCharName(c, gameCode), `profile:${uid}:${c.id}`));
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
    const T = I18N.PLAYER_CENTER.DASHBOARD || {};
    const CP = I18N.CHAR_PANEL;
    
    // 增加数据结构防御性检查
    if (!data || !data.player) {
        return CP.DATA_EXCEPTION;
    }

    // 安全地获取 UI 模版文本，不硬编码默认值
    let msg = T.TITLE || '';
    if (data._isPlaceholder) {
        msg += T.QUEUING || '';
    } else if (data._isFallback) {
        msg += T.FALLBACK || '';
    }
    
    // 安全地提取数据字段，默认为 ???
    const getValue = (val) => (val !== undefined && val !== null && val !== '') ? val : '???';

    if (T.INFO) {
        msg += T.INFO
            .replace('{nickname}', esc(getValue(data.player.nickname)))
            .replace('{uid}', getValue(data.player.uid))
            .replace('{level}', getValue(data.player.level))
            .replace('{achievement}', getValue(data.player.space_info?.achievement_count))
            .replace('{avatar}', getValue(data.player.space_info?.avatar_count));
    }
    return msg;
}

/**
 * 渲染角色详情文案 (核心业务逻辑，支持多游戏及本地测试复用)
 * @param {Object} char - 角色数据对象
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {string} 格式化后的角色详情 HTML 文案
 */
function renderCharacterDetail(char, gameCode = 'HSR') {
    if (!char) {
        const { I18N } = getCfg(gameCode);
        return I18N.CHAR_PANEL.CHAR_DATA_MISSING;
    }
    const { I18N, PROFILE_UI, STATS } = getCfg(gameCode);
    const T = I18N.CHAR_PANEL.DETAIL;

    let msg = T.TITLE
        .replace('{name}', esc(getDisplayCharName(char, gameCode)))
        .replace('{level}', char.level || '?')
        .replace('{rank}', char.rank || 0)
        .replace('{path}', char.path?.name || '未知')
        .replace('{element}', char.element?.name || '未知');

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
        msg += `${STATS[id][1]}: ${res.totalDisplay.padEnd(8)} (${res.breakdownDisplay})\n`;
    });

    PROFILE_UI.other.forEach(id => {
        let res, name;
        if (id === 'all_dmg') {
            const dmg = getDmgBonusData(char, gameCode);
            res = { totalDisplay: dmg.totalDisplay, breakdownDisplay: dmg.breakdownDisplay };
            name = dmg.name;
        } else {
            res = getStatParts(char, id, true);
            name = STATS[id][1];
        }
        msg += `${name}: ${res.totalDisplay.padEnd(8)} (${res.breakdownDisplay})\n`;
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
 * 校验用户是否绑定了该 UID
 * @param {string|number} tgId - Telegram 用户 ID
 * @param {string|number} uid - 游戏 UID
 * @param {string} [gameCode='HSR'] - 游戏代码
 * @returns {Promise<boolean>}
 */
const isUidBound = async (tgId, uid, gameCode = 'HSR') => {
    const boundUid = await cache.getBindUid(tgId, gameCode);
    return boundUid === String(uid);
};

/**
 * 核心渲染函数：显示角色详情 (支持从缓存或强制刷新后调用)
 */
async function showCharacterDetail(ctx, uid, charId, gameCode = 'HSR') {
    const { I18N } = getCfg(gameCode);
    let data = await getMergedData(uid, { gameCode });
    if (!data || data._isPlaceholder) {
        const shouldSave = await isUidBound(ctx.from.id, uid, gameCode);
        data = await getMergedData(uid, { force: true, gameCode, shouldSave });
    }
    
    const char = data?.characters?.find(c => String(c.id) === String(charId));
    if (!char) return;

    const msg = renderCharacterDetail(char, gameCode);
    try {
        await ctx.editMessageText(msg, { 
            parse_mode: 'HTML',
            ...getShowcaseKeyboard(uid, data.characters, gameCode)
        });
    } catch (e) { 
        if (!e.message.includes('not modified')) {
            logger.error(I18N.CHAR_PANEL.EDIT_FAIL, e.message);
        }
    }
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
        
        // 【优化】先在 Valkey 中创建占位缓存，提升首次同步成功率
        const placeholder = api.getPlaceholderData(uid);
        await cache.setCache(uid, placeholder, 300, gameCode);

        await ctx.reply(I18N.AUTH.BINDING.replace('{uid}', uid), { parse_mode: 'HTML' });
        const dashboardMsg = await ctx.reply(renderPlayerInfo(placeholder, gameCode), {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(uid, [], gameCode)
        });

        (async () => {
            try {
                const data = await getMergedData(uid, { force: true, gameCode, shouldSave: true });
                if (data && !data._isPlaceholder && data.player?.nickname) {
                    logger.done(`UID ${uid} 数据后台同步成功`);
                    await ctx.telegram.editMessageText(ctx.chat.id, dashboardMsg.message_id, null, renderPlayerInfo(data, gameCode) + I18N.PLAYER_CENTER.DASHBOARD.SYNC_SUCCESS, {
                        parse_mode: 'HTML',
                        ...getMainMenuKeyboard(uid, data.characters, gameCode)
                    }).catch(() => {});
                } else {
                    logger.warn(`UID ${uid} 数据同步返回了无效或占位数据`);
                    const errorMsg = renderPlayerInfo(data, gameCode) + `\n\n❌ ${I18N.CHAR_PANEL.SYNC_FAIL}`;
                    await ctx.telegram.editMessageText(ctx.chat.id, dashboardMsg.message_id, null, errorMsg, {
                        parse_mode: 'HTML',
                        ...getMainMenuKeyboard(uid, [], gameCode)
                    }).catch(() => {});
                }
            } catch (e) {
                logger.error(I18N.CHAR_PANEL.SYNC_FAIL, e);
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
        const data = await getMergedData(uid, { force: true, gameCode, shouldSave: true });
        if (data && !data._isPlaceholder && data.player?.nickname) {
            logger.done(`用户 ${ctx.from.id} 强制刷新 UID ${uid} 成功`);
            ctx.reply(I18N.AUTH.UPDATE_DONE);
        } else {
            logger.warn(`UID ${uid} 刷新返回了无效或占位数据，拒绝写入本地`);
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
        const data = await getMergedData(uid, { gameCode, shouldSave: true });
        if (!data) return ctx.reply(I18N.COMMON.ERROR_API);
        
        await ctx.reply(renderPlayerInfo(data, gameCode), {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(uid, data.characters, gameCode)
        });
    });

    bot.action(/^me_main:([1-9]\d{8})$/, async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const uid = ctx.match[1];
        const gameCode = 'HSR';
        const data = await getMergedData(uid, { gameCode });
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
        const data = await getMergedData(uid, { gameCode });
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

        // 【优化】先检查是否有缓存，若无则在 Valkey 中创建占位缓存，提升首次响应速度
        let data = await getMergedData(uid, { gameCode });
        if (!data) {
            data = api.getPlaceholderData(uid);
            await cache.setCache(uid, data, 300, gameCode);
        }

        const dashboardMsg = await ctx.reply(renderPlayerInfo(data, gameCode), {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(uid, data.characters, gameCode)
        });

        // 如果是占位数据或回退数据，发起异步静默更新
        if (data._isPlaceholder || data._isFallback) {
            (async () => {
                try {
                    const shouldSave = await isUidBound(ctx.from.id, uid, gameCode);
                    const freshData = await getMergedData(uid, { force: true, gameCode, shouldSave });
                    
                    if (freshData && !freshData._isPlaceholder && freshData.player?.nickname) {
                        await ctx.telegram.editMessageText(ctx.chat.id, dashboardMsg.message_id, null, renderPlayerInfo(freshData, gameCode), {
                            parse_mode: 'HTML',
                            ...getMainMenuKeyboard(uid, freshData.characters, gameCode)
                        }).catch(() => {});
                    } else if (!data._isFallback) {
                        logger.warn(`UID ${uid} 同步返回了无效数据`);
                        const errorMsg = renderPlayerInfo(freshData, gameCode) + `\n\n❌ ${I18N.CHAR_PANEL.SYNC_FAIL}`;
                        await ctx.telegram.editMessageText(ctx.chat.id, dashboardMsg.message_id, null, errorMsg, {
                            parse_mode: 'HTML',
                            ...getMainMenuKeyboard(uid, freshData.characters, gameCode)
                        }).catch(() => {});
                    }
                } catch (e) {
                    logger.error(I18N.CHAR_PANEL.SYNC_FAIL, e);
                }
            })();
        }
    });

    bot.action(/^profile:([1-9]\d{8}):(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const uid = ctx.match[1];
        const charId = ctx.match[2];
        const gameCode = 'HSR';
        await showCharacterDetail(ctx, uid, charId, gameCode);
    });

    bot.action(/^sync_data:([1-9]\d{8})(?::(\d+))?$/, async (ctx) => {
        const gameCode = 'HSR';
        const { I18N } = getCfg(gameCode);
        const T = I18N.PLAYER_CENTER.DASHBOARD;
        const uid = ctx.match[1];
        const charId = ctx.match[2];
        await ctx.editMessageText(T.TITLE + T.QUEUING + T.SYNC_IN_PROGRESS, { parse_mode: 'HTML' }).catch(() => {});
        
        const shouldSave = await isUidBound(ctx.from.id, uid, gameCode);
        const data = await getMergedData(uid, { force: true, gameCode, shouldSave });
        if (!data) return ctx.reply(I18N.COMMON.ERROR_API, { parse_mode: 'HTML' });
        
        if (charId && !data._isPlaceholder) {
            return showCharacterDetail(ctx, uid, charId, gameCode);
        } else {
            let msg = renderPlayerInfo(data, gameCode);
            if (data._isPlaceholder) {
                msg += `\n\n❌ ${I18N.CHAR_PANEL.SYNC_FAIL}\nAPI 暂未响应，请稍后再试。`;
            } else {
                msg += data._isFallback ? I18N.PLAYER_CENTER.DASHBOARD.SYNC_BACK_FALLBACK : I18N.PLAYER_CENTER.DASHBOARD.SYNC_SUCCESS;
            }
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
