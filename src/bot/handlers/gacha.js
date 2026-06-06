// src/bot/handlers/gacha.js
/**
 * 抽卡模块处理器
 * 负责处理与抽卡记录相关的 Telegram 指令、回调动作及 JSON 文件导入导出
 */
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

/**
 * 统一获取游戏配置、翻译和设置
 * @param {string} gameCode - 游戏代码 (默认 'HSR')
 * @returns {Object} 包含常量、国际化配置和应用设置的对象
 */
const getCfg = (gameCode = 'HSR') => {
    const constants = loadModule(path.join(process.cwd(), 'config/game-constants.js'));
    const i18n = loadModule(path.join(process.cwd(), 'config/bot-i18n.js'));
    const settings = loadModule(path.join(process.cwd(), 'config/app-settings.js'));
    
    return {
        CONST: constants,
        GAME_CONST: constants[gameCode] || constants.HSR,
        I18N: i18n.I18N,
        SETTINGS: settings[gameCode] || settings.HSR
    };
};

/**
 * 生成抽卡相关功能的内联键盘
 * @param {string|number} uid - 用户游戏UID
 * @param {string} gameCode - 游戏代码
 * @returns {Object} Telegraf InlineKeyboard 对象
 */
const getGachaKeyboard = (uid, gameCode = 'HSR') => {
    const { I18N } = getCfg(gameCode);
    return Markup.inlineKeyboard([
        [
            Markup.button.callback(I18N.GACHA.KEYBOARD.CHAR_POOL, `gacha_pool:${gameCode}:${uid}:11`),
            Markup.button.callback(I18N.GACHA.KEYBOARD.WEAPON_POOL, `gacha_pool:${gameCode}:${uid}:12`)
        ],
        [
            Markup.button.callback(I18N.GACHA.KEYBOARD.COLLAB_CHAR, `gacha_pool:${gameCode}:${uid}:21`),
            Markup.button.callback(I18N.GACHA.KEYBOARD.COLLAB_WEAPON, `gacha_pool:${gameCode}:${uid}:22`)
        ],
        [
            Markup.button.callback(I18N.GACHA.KEYBOARD.STANDARD_POOL, `gacha_pool:${gameCode}:${uid}:1`),
            Markup.button.callback(I18N.GACHA.KEYBOARD.EXPORT, `gacha_export:${gameCode}:${uid}`)
        ],
        [
            Markup.button.callback(I18N.GACHA.KEYBOARD.BACK_TO_ME, `back_to_me:${uid}`)
        ]
    ]);
};

/**
 * 初始化抽卡模块的 Telegram 机器人处理器 (命令与回调)
 * @param {Object} bot - Telegraf 机器人实例
 */
const setupGachaHandlers = (bot) => {
    
    // 处理上传的 .json 格式抽卡记录文件
    bot.on('document', async (ctx) => {
        const { I18N, CONST } = getCfg();
        // 过滤非 JSON 文件
        if (!ctx.message.document.file_name.endsWith('.json')) return;
        
        await ctx.reply(I18N.GACHA.LOADING);
        try {
            // 获取文件下载链接
            const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
            const res = await axios.get(fileLink.href);
            
            // 使用解析器转换 JSON 数据格式
            const { uid, logs } = gachaParser.parseGachaJson(res.data);

            if (!uid || !logs || logs.length === 0) {
                throw new Error(I18N.GACHA.ERROR_NO_DATA);
            }

            // 保存并合并到本地存储
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

    // 处理 /gacha 指令 (通过抽卡链接同步数据)
    bot.command('gacha', async (ctx) => {
        const gameCode = 'HSR';
        const { I18N } = getCfg(gameCode);
        const text = ctx.message.text || "";
        // 尝试从消息中提取链接，若无则尝试回复的消息内容
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        const input = urlMatch ? urlMatch[0] : (ctx.message.reply_to_message?.text || "");

        // 尝试解析抽卡链接
        const params = await gachaParser.parseGachaUrl(input);
        
        if (!params) {
            // 解析失败，提示用户正确格式
            return ctx.reply(I18N.GACHA.HELP_PROMPT, { 
                parse_mode: 'HTML',
                reply_markup: Markup.forceReply().reply_markup
            });
        }

        await ctx.reply(I18N.COMMON.LOADING);
        // 调用API获取最新记录
        const result = await gachaApi.fetchGachaLogs(params);
        
        if (result?.error === 'UNSUPPORTED_GAME') {
            return ctx.reply(gachaRender.renderUnsupportedGame(result.gameCode), { parse_mode: 'HTML' });
        }

        if (!result || !result.uid) {
            logger.warn(`用户 ${ctx.from.id} 尝试同步抽卡记录失败: 链接无效或过期`);
            return ctx.reply(I18N.GACHA.API_FAILED);
        }

        // 存储同步的记录
        const finalLogs = gachaStorage.saveAndMergeGacha(result.uid, result.logs, {
            gameCode: result.gameCode,
            game_biz: result.game_biz,
            region: result.region
        });
        logger.done(`用户 ${ctx.from.id} 同步 UID ${result.uid} [${result.gameCode}] 抽卡记录成功 (新增 ${result.logs.length}条)`);
        
        // 返回分析摘要
        const msg = gachaRender.renderGachaText(result.uid, "11", finalLogs, result.gameCode);
        await ctx.reply(msg, {
            parse_mode: 'HTML',
            ...getGachaKeyboard(result.uid, result.gameCode)
        });
    });

    // 处理抽卡记录导出请求 (回调)
    bot.action(/^gacha_export:(\w+):([1-9]\d{8})$/, async (ctx) => {
        const [_, gameCode, uid] = ctx.match;
        const { I18N } = getCfg(gameCode);
        const filePath = gachaStorage.getExportGachaPath(uid, gameCode);

        // 检查本地是否存在记录文件
        if (!require('fs').existsSync(filePath)) {
            return ctx.answerCbQuery(I18N.GACHA.EXPORT_MESSAGES.EMPTY).catch(() => {});
        }

        // 立即给予 UI 反馈
        const feedbackMsg = await ctx.reply(I18N.GACHA.EXPORT_MESSAGES.LOADING).catch(() => {});

        // 异步后台处理文件发送，不阻塞后续交互
        (async () => {
            const fs = require('fs').promises;
            let fileBuffer;
            try {
                fileBuffer = await fs.readFile(filePath);
            } catch (readErr) {
                logger.error(`导出任务启动失败: 读取文件错误`, readErr.message);
                if (feedbackMsg) await ctx.telegram.editMessageText(ctx.chat.id, feedbackMsg.message_id, null, I18N.GACHA.EXPORT_MESSAGES.ERROR.replace('{error}', '文件读取错误')).catch(() => {});
                return;
            }

            try {
                // 1. 优先尝试使用原生 Buffer 方式发送，设置 5 秒超时
                await Promise.race([
                    ctx.telegram.sendDocument(ctx.chat.id, { 
                        source: fileBuffer, 
                        filename: `gacha_${uid}_${gameCode}.json` 
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('原生发送超时')), 5000))
                ]);
                logger.done(`[导出后台] 原生 Buffer 发送成功`);
                if (feedbackMsg) await ctx.telegram.deleteMessage(ctx.chat.id, feedbackMsg.message_id).catch(() => {});
            } catch (err) {
                logger.warn(`[导出后台] 原生发送失败，尝试回退方案 (Error: ${err.message})`);
                try {
                    // 2. 回退：手动构造原生 HTTPS 请求上传文件 (无需 form-data)
                    const https = require('https');
                    const boundary = 'hsr-tg-bot-' + Date.now().toString(16);

                    const postData = Buffer.concat([
                        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${ctx.chat.id}\r\n`),
                        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="gacha_${uid}_${gameCode}.json"\r\nContent-Type: application/json\r\n\r\n`),
                        fileBuffer,
                        Buffer.from(`\r\n--${boundary}--\r\n`)
                    ]);

                    const options = {
                        hostname: 'api.telegram.org',
                        path: `/bot${process.env.BOT_TOKEN}/sendDocument`,
                        method: 'POST',
                        headers: {
                            'Content-Type': `multipart/form-data; boundary=${boundary}`,
                            'Content-Length': postData.length
                        },
                        timeout: 30000
                    };

                    await new Promise((resolve, reject) => {
                        const req = https.request(options, (res) => {
                            let data = '';
                            res.on('data', chunk => data += chunk);
                            res.on('end', () => {
                                if (res.statusCode === 200) resolve(data);
                                else reject(new Error(`Telegram API 返回状态码: ${res.statusCode}, 响应: ${data}`));
                            });
                        });
                        req.on('error', reject);
                        req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
                        req.write(postData);
                        req.end();
                    });

                    logger.done(`[导出后台] 回退方案发送成功`);
                    if (feedbackMsg) await ctx.telegram.deleteMessage(ctx.chat.id, feedbackMsg.message_id).catch(() => {});
                } catch (fallbackErr) {
                    logger.error(`[导出后台] 回退方案亦失败:`, fallbackErr.message);
                    if (feedbackMsg) {
                        await ctx.telegram.editMessageText(ctx.chat.id, feedbackMsg.message_id, null, I18N.GACHA.EXPORT_MESSAGES.ERROR.replace('{error}', fallbackErr.message)).catch(() => {});
                    } else {
                        await ctx.reply(I18N.GACHA.EXPORT_MESSAGES.ERROR.replace('{error}', fallbackErr.message)).catch(() => {});
                    }
                }
            }
        })();
    });

    // 处理查看特定卡池统计的回调
    bot.action(/^gacha_pool:(\w+):([1-9]\d{8}):(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const [_, gameCode, uid, poolId] = ctx.match;
        const { I18N } = getCfg(gameCode);

        // 简单游戏兼容检查
        if (gameCode !== 'HSR') {
            return ctx.editMessageText(gachaRender.renderUnsupportedGame(gameCode), {
                parse_mode: 'HTML',
                ...getGachaKeyboard(uid, gameCode)
            }).catch(() => {});
        }

        // 读取本地数据
        const logs = gachaStorage.getLocalGacha(uid, gameCode);
        if (!logs || logs.length === 0) {
            return ctx.editMessageText(I18N.GACHA.EMPTY_DATA, {
                parse_mode: 'HTML',
                ...getGachaKeyboard(uid, gameCode)
            }).catch(() => {});
        }

        // 渲染并编辑消息展示数据
        const msg = gachaRender.renderGachaText(uid, poolId, logs, gameCode);
        try {
            await ctx.editMessageText(msg, {
                parse_mode: 'HTML',
                ...getGachaKeyboard(uid, gameCode)
            });
        } catch (e) { if (!e.message.includes('not modified')) logger.error('编辑抽卡分析消息失败', e.message); }
    });

    // 返回个人中心按钮回调
    bot.action(/^back_to_me:([1-9]\d{8})$/, async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const uid = ctx.match[1];
        const data = await api.getPlayerDetail(uid);
        if (!data) return;

        // 动态加载 profile 模块以避免循环引用
        const { renderPlayerInfo, getMainMenuKeyboard } = require('./profile');
        
        await ctx.editMessageText(renderPlayerInfo(data, 'HSR'), {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(uid, data.characters, 'HSR')
        }).catch(() => {});
    });
};

module.exports = { setupGachaHandlers, getGachaKeyboard };
