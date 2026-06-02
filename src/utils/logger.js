// src/utils/logger.js
const moment = require('moment');

/**
 * 简易日志系统 (模仿 Yunzai 风格)
 */
class Logger {
    constructor() {
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

    getTime() {
        return moment().format('HH:mm:ss');
    }

    /**
     * 系统级信息 (白色)
     */
    info(msg) {
        console.log(`${this.gray(this.getTime())} [INFO] ${msg}`);
    }

    /**
     * 指令执行信息 (青色)
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
     * 交互执行信息 (紫色)
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
     * 业务成功信息 (绿色)
     */
    done(msg) {
        console.log(`${this.gray(this.getTime())} ${this.green('[成功]')} ${msg}`);
    }

    /**
     * 警告信息 (黄色)
     */
    warn(msg) {
        console.log(`${this.gray(this.getTime())} ${this.yellow('[警告]')} ${msg}`);
    }

    /**
     * 错误信息 (红色)
     */
    error(msg, err = "") {
        console.error(`${this.gray(this.getTime())} ${this.red('[错误]')} ${msg}`, err);
    }

    // 辅助着色函数
    blue(s) { return `${this.colors.blue}${s}${this.colors.reset}`; }
    green(s) { return `${this.colors.green}${s}${this.colors.reset}`; }
    yellow(s) { return `${this.colors.yellow}${s}${this.colors.reset}`; }
    red(s) { return `${this.colors.red}${s}${this.colors.reset}`; }
    magenta(s) { return `${this.colors.magenta}${s}${this.colors.reset}`; }
    cyan(s) { return `${this.colors.cyan}${s}${this.colors.reset}`; }
    gray(s) { return `${this.colors.gray}${s}${this.colors.reset}`; }
}

module.exports = new Logger();
