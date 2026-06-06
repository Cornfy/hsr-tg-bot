// src/utils/logger.js
/**
 * 日志模块
 * 提供统一的终端日志格式化输出功能，支持按类别着色（INFO, 指令, 交互, 成功, 警告, 错误）
 */
const moment = require('moment');

/**
 * 日志记录器类
 */
class Logger {
    constructor() {
        // 定义控制台 ANSI 着色配置
        this.colors = {
            reset: "\x1b[0m",
            blue: "\x1b[34m",
            green: "\x1b[32m",
            yellow: "\x1b[33m",
            red: "\x1b[31m",
            magenta: "\x1b[35m",
            cyan: "\x1b[36m",
            gray: "\x1b[90m"
        };
    }

    /**
     * 获取当前格式化时间戳
     * @returns {string} HH:mm:ss 格式时间
     */
    getTime() {
        return moment().format('HH:mm:ss');
    }

    /**
     * 记录普通系统级信息
     * @param {string} msg - 日志信息
     */
    info(msg) {
        console.log(`${this.gray(this.getTime())} [INFO] ${msg}`);
    }

    /**
     * 记录用户触发的机器人指令
     * @param {Object} ctx - Telegraf 上下文对象
     * @param {string} cmdName - 指令名称
     */
    command(ctx, cmdName) {
        const user = ctx.from;
        const name = user.username ? `@${user.username}` : `${user.first_name}${user.last_name || ''}`;
        const chatType = ctx.chat.type === 'private' ? '私聊' : `群[${ctx.chat.title || ctx.chat.id}]`;
        
        console.log(
            `${this.gray(this.getTime())} ${this.cyan('[指令]')} ` +
            `${this.blue(name)}(${user.id}) ${this.gray('在')} ${this.magenta(chatType)} ${this.gray('执行')}: ${this.yellow(cmdName)}`
        );
    }

    /**
     * 记录用户触发的按钮交互动作
     * @param {Object} ctx - Telegraf 上下文对象
     * @param {string} actionName - 交互动作名称
     */
    action(ctx, actionName) {
        const user = ctx.from;
        const name = user.username ? `@${user.username}` : `${user.first_name}${user.last_name || ''}`;
        console.log(
            `${this.gray(this.getTime())} ${this.magenta('[交互]')} ` +
            `${this.blue(name)}(${user.id}) ${this.gray('触发按钮')}: ${this.yellow(actionName)}`
        );
    }

    /**
     * 记录业务成功执行的信息
     * @param {string} msg - 成功描述信息
     */
    done(msg) {
        console.log(`${this.gray(this.getTime())} ${this.green('[成功]')} ${msg}`);
    }

    /**
     * 记录警告信息
     * @param {string} msg - 警告信息
     */
    warn(msg) {
        console.log(`${this.gray(this.getTime())} ${this.yellow('[警告]')} ${msg}`);
    }

    /**
     * 记录错误信息
     * @param {string} msg - 错误描述信息
     * @param {string|Error} [err] - 错误堆栈或对象
     */
    error(msg, err = "") {
        console.error(`${this.gray(this.getTime())} ${this.red('[错误]')} ${msg}`, err);
    }

    // 辅助颜色包装函数
    blue(s) { return `${this.colors.blue}${s}${this.colors.reset}`; }
    green(s) { return `${this.colors.green}${s}${this.colors.reset}`; }
    yellow(s) { return `${this.colors.yellow}${s}${this.colors.reset}`; }
    red(s) { return `${this.colors.red}${s}${this.colors.reset}`; }
    magenta(s) { return `${this.colors.magenta}${s}${this.colors.reset}`; }
    cyan(s) { return `${this.colors.cyan}${s}${this.colors.reset}`; }
    gray(s) { return `${this.colors.gray}${s}${this.colors.reset}`; }
}

module.exports = new Logger();
