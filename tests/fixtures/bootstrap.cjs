// 在隔离进程中运行真实入口源码；不加载 dotenv、业务模块或用户缓存。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { summarizeError } = require('../../src/utils/error-summary');
const { Polling } = require('../../node_modules/telegraf/lib/core/network/polling');

const scenario = process.argv[2];
const failure = Object.assign(new TypeError('PRIVATE_ERROR_MESSAGE'), {
    code: 'ECONNRESET', path: 'PRIVATE_REQUEST_URL', payload: 'PRIVATE_UPDATE'
});
const logger = Object.fromEntries(['done', 'error'].map(level => [level,
    (...args) => console.log(JSON.stringify({ level, args }))
]));

class FakeBot {
    constructor() {
        this.telegram = {
            setMyCommands: async (_, options) => {
                if (scenario === 'admin-failure' && options) throw failure;
            }
        };
    }

    catch(handler) { this.handleError = handler; }

    async launch(_, onLaunch) {
        onLaunch();
        if (scenario === 'polling-return') return;
        if (scenario === 'handler-failure') return this.handleError(failure);

        // 使用安装版本的真实长轮询逻辑，重现 Bun 的 TypeError/ECONNRESET。
        let calls = 0;
        const polling = new Polling({
            callApi: async () => {
                if (calls++ === 0) throw failure;
                return []; // 轮询结束时的 offset 同步
            }
        }, []);
        await polling.loop(() => {});
    }
}

const dependencies = {
    './src/utils/log-redaction': { installLogRedaction() {} },
    telegraf: { Telegraf: FakeBot },
    dotenv: { config() {} },
    './src/cache/server': {
        async start() { if (scenario === 'startup-failure') throw failure; },
        stop() {
            console.log('PRIVATE_VALKEY_STOP_REQUESTED');
            if (scenario === 'cleanup-failure') throw new Error('PRIVATE_CLEANUP_ERROR');
        }
    },
    './src/bot/handlers': { setupHandlers() {} },
    './src/utils/logger': logger,
    './src/utils/error-summary': { summarizeError }
};

// 模拟 Redis 持续占用事件循环；只设置 exitCode 将无法在超时前退出。
setInterval(() => {}, 1000);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../main.js'), 'utf8'), {
    require(name) {
        if (!(name in dependencies)) throw new Error('Unexpected dependency');
        return dependencies[name];
    },
    process: {
        env: scenario === 'admin-failure' ? { ADMIN_TG_ID: 'TEST_ONLY' } : {},
        exit: code => process.exit(code)
    }
});
