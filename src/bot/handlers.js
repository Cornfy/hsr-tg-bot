// src/bot/handlers.js
const path = require('path');
const { Composer } = require('telegraf');
const { loadModule } = require('../utils/loader');
const logger = require('../utils/logger');

// 内部核心状态：保持当前激活的动态路由网关指针
let currentHandlers = null;

/**
 * 安全清理所有业务文件、渲染器、元数据及 UI 文本的 Node 缓存并完成全量热重载
 */
function reloadAllModules() {
    logger.info('正在执行全量业务逻辑热更新...');

    // 统一定义需要斩断缓存的所有核心模块绝对路径
    const paths = {
        scorer: path.join(process.cwd(), 'src/utils/relic-scorer'),
        meta: path.join(process.cwd(), 'src/utils/meta'),
        gachaRender: path.join(process.cwd(), 'src/utils/gacha-render'),
        uiCfg: path.join(process.cwd(), 'config/ui-config'),
        profile: path.join(process.cwd(), 'src/bot/handlers/profile'),
        gacha: path.join(process.cwd(), 'src/bot/handlers/gacha')
    };

    // 1. 强力清除 require.cache 缓存，确保本地硬盘文件的修改能立刻生效
    Object.values(paths).forEach(p => {
        try { delete require.cache[require.resolve(p)]; } catch (e) {}
    });

    // 2. 执行底层工具类的热重载加载
    loadModule(paths.scorer);
    loadModule(paths.meta);
    loadModule(paths.gachaRender);

    // 3. 动态加载最新的 UI 配置和子模块路由注册器
    const uiCfg = require(paths.uiCfg);
    const { WELCOME_MSG, TEXT } = uiCfg;
    const { setupProfileHandlers } = require('./handlers/profile');
    const { setupGachaHandlers } = require('./handlers/gacha');

    // 4. 创建一个干净的、隔离的全新 Composer 容器来收集新一代路由
    const stage = new Composer();

    // a. 智能捕获：处理 Force Reply 的回复并伪造实体指令的分发
    stage.on('text', async (ctx, next) => {
        if (ctx.message.text.startsWith('/')) return next();

        const reply = ctx.message.reply_to_message;
        if (!reply || reply.from.id !== ctx.botInfo.id) return next();

        const text = ctx.message.text.trim();

        // 处理 UID 类的回复 (profile / bind)
        if (reply.text.includes(TEXT.key.uid)) {
            const uidMatch = text.match(/[1-9]\d{8}/);
            const cmd = reply.text.includes(TEXT.key.bind) ? 'bind' : 'profile';
            const input = uidMatch ? uidMatch[0] : text;

            ctx.message.text = `/${cmd} ${input}`;
            ctx.message.entities = [{ type: 'bot_command', offset: 0, length: cmd.length + 1 }];
            return next();
        }

        // 处理 Gacha 链接/文件类的回复
        if (reply.text.includes(TEXT.key.gacha_log) || reply.text.includes(TEXT.key.link)) {
            const urlMatch = text.match(/https?:\/\/[^\s]+/);
            const input = urlMatch ? urlMatch[0] : text;

            ctx.message.text = `/gacha ${input}`;
            ctx.message.entities = [{ type: 'bot_command', offset: 0, length: 6 }];
            return next();
        }

        return next();
    });

    // b. 初始化挂载子业务路由至新 Composer 容器中
    setupProfileHandlers(stage);
    setupGachaHandlers(stage);

    // c. 基础公共基础指令 (多行文本已完美分离)
    const welcomeHandler = (ctx) => {
        ctx.reply(WELCOME_MSG, { parse_mode: 'HTML' });
    };

    stage.start(welcomeHandler);
    stage.command('help', welcomeHandler);

    stage.on('new_chat_members', (ctx) => {
        const isBot = ctx.message.new_chat_members.some(m => m.id === ctx.botInfo.id);
        if (isBot) welcomeHandler(ctx);
    });

    // d. 管理员专属 /reload 指令 (在此挂载，让重载逻辑本身也支持热更新)
    stage.command('reload', async (ctx) => {
        if (!process.env.ADMIN_TG_ID || String(ctx.from.id) !== String(process.env.ADMIN_TG_ID)) {
            return ctx.reply(TEXT.common.error_permission);
        }
        try {
            reloadAllModules();
            await ctx.reply(TEXT.sys.reload_success);
        } catch (e) {
            logger.error('指令重载失败', e);
            await ctx.reply(TEXT.sys.reload_error.replace('{error}', e.message));
        }
    });

    // 5. 替换外壳网关指向，旧的 stage 容器失去引用后会被 V8 自动 GC 垃圾回收
    currentHandlers = stage;
    logger.done('全量业务逻辑、元数据及 UI 配置已完成热更新');
}

// 确保在项目首次加载启动时，初始化好第一代业务路由网关
reloadAllModules();

const setupHandlers = (bot) => {
    // 【核心日志中间件】
    bot.use((ctx, next) => {
        if (ctx.message?.text?.startsWith('/')) {
            const cmd = ctx.message.text.split(/\s+/)[0];
            logger.command(ctx, cmd);
        } else if (ctx.callbackQuery) {
            logger.action(ctx, ctx.callbackQuery.data);
        }
        return next();
    });

    // 【核心网关】全局统一拦截：动态将流量导向当前最新的 currentHandlers 逻辑容器
    bot.use((ctx, next) => {
        if (currentHandlers) {
            return currentHandlers.middleware()(ctx, next);
        }
        return next();
    });

    // 【全局唯一安全监听】处理后台 Inline 按钮（Callback Query）触发的 force_reload_cfg
    bot.action('force_reload_cfg', async (ctx) => {
        const { TEXT } = loadModule(path.join(process.cwd(), 'config/ui-config'));
        if (!process.env.ADMIN_TG_ID || String(ctx.from.id) !== String(process.env.ADMIN_TG_ID)) {
            logger.warn(`非法重载尝试: 用户 ${ctx.from.id}`);
            return ctx.answerCbQuery(TEXT.common.error_permission, { show_alert: true }).catch(() => {});
        }

        try {
            reloadAllModules();
            await ctx.answerCbQuery(TEXT.sys.reload_action_success, { show_alert: true }).catch(() => {});
        } catch (e) {
            logger.error('Action重载失败', e);
            await ctx.answerCbQuery(TEXT.sys.reload_error.replace('{error}', e.message), { show_alert: true }).catch(() => {});
        }
    });
};

module.exports = { setupHandlers };
