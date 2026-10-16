const { Console } = require('node:console');
const { StringDecoder } = require('node:string_decoder');
const { writeSync } = require('node:fs');
const { summarizeError } = require('./error-summary');

// 按 token 格式匹配，无需读取环境变量；兼容 URL 编码后的冒号。
function redactLog(text, { redactIds = false } = {}) {
    let result = text.replace(/\d+(?::|%3a)[A-Za-z0-9_-]{20,}/gi, '[BOT_TOKEN_REDACTED]');
    if (redactIds) {
        // 同时覆盖正文、回调参数、JSON、URL 和缓存文件路径中的 ID。
        // 包括 gacha_<UID> 等文件名；保留 HTTP 429、四位角色 ID 等诊断信息。
        result = result.replace(/-?\d{5,}/g, '[ID_REDACTED]');
    }
    return result;
}

let installed = false;

function installLogRedaction({ redactIds = process.argv.includes('--redact-ids') } = {}) {
    if (installed) return;
    installed = true;

    const flushers = [];
    for (const stream of [process.stdout, process.stderr]) {
        const write = stream.write.bind(stream);
        const decoder = new StringDecoder('utf8');
        let pending = '';

        // 按行过滤，兼容 debug 等依赖直接写流，以及 token / UTF-8 跨 chunk 的情况。
        stream.write = function (chunk, encoding, callback) {
            if (typeof encoding === 'function') {
                callback = encoding;
                encoding = undefined;
            }
            pending += decoder.write(typeof chunk === 'string'
                ? Buffer.from(chunk, encoding || 'utf8')
                : Buffer.from(chunk));
            const end = pending.lastIndexOf('\n');
            if (end === -1) {
                if (callback) queueMicrotask(callback);
                return true;
            }
            const output = redactLog(pending.slice(0, end + 1), { redactIds });
            pending = pending.slice(end + 1);
            return write(output, 'utf8', callback);
        };

        flushers.push(() => {
            const tail = redactLog(pending + decoder.end(), { redactIds });
            pending = '';
            // process.exit() 不等待异步写入，使用同步输出保留末尾没有换行的日志。
            if (tail) writeSync(stream.fd, tail);
        });
    }

    // Bun 原生 console 绕过 stream.write；Node Console 会经过上面的过滤器。
    globalThis.console = new Console({ stdout: process.stdout, stderr: process.stderr });
    process.once('exit', () => {
        for (const flush of flushers) flush();
    });

    // 运行时默认的异常报告可能绕过 JS 输出流并包含请求 URL，改用安全摘要。
    for (const event of ['uncaughtException', 'unhandledRejection']) {
        process.on(event, (err) => {
            console.error(event, summarizeError(err));
            process.exit(1);
        });
    }
}

module.exports = { redactLog, installLogRedaction };
