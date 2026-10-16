const { test, expect } = require('bun:test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { redactLog } = require('../src/utils/log-redaction');

// 全部为合成测试值，不从环境或用户数据中获取。
const token = '123456789:FAKE_test_secret_abcdefghijklmnopqrstuvwxyz-';
const tgId = '987654321';
const gameId = '876543219';
const guardPath = path.join(__dirname, '../src/utils/log-redaction.js');
const loggerPath = path.join(__dirname, '../src/utils/logger.js');

function runScript(source) {
    return spawnSync(process.execPath, ['--no-env-file', '-e', source], {
        env: {}, encoding: 'utf8', timeout: 5000
    });
}

test('tokens are hidden in plain text, Bot API / file URLs, and encoded URLs', () => {
    for (const input of [
        token,
        `https://api.telegram.org/bot${token}/getUpdates`,
        `https://api.telegram.org/file/bot${token}/document.json`,
        encodeURIComponent(`https://api.telegram.org/bot${token}/getUpdates`),
        JSON.stringify({ BOT_TOKEN: token }),
        `Error: token=${token}\n at request (${token})`
    ]) {
        const output = redactLog(input);
        expect(output).not.toContain(token);
        expect(output).not.toContain(token.split(':')[1]);
        expect(output).toContain('[BOT_TOKEN_REDACTED]');
    }
    expect(redactLog(`用户 ${tgId}, UID ${gameId}`)).toContain(gameId);
});

test('optional ID redaction covers callbacks, filenames, JSON and negative chat IDs', () => {
    const input = `2026-10-16 02:15:46 HTTP 429 ECONNRESET profile:${gameId}:1503 ` +
        `用户 ${tgId} chat_id=-100${tgId} /data/HSR/gacha_${gameId}_HSR.json ` +
        JSON.stringify({ user_id: tgId });
    const output = redactLog(input, { redactIds: true });
    expect(output).not.toContain(tgId);
    expect(output).not.toContain(gameId);
    expect(output).toContain('profile:[ID_REDACTED]:1503');
    expect(output).toContain('2026-10-16 02:15:46 HTTP 429 ECONNRESET');
    expect(output).toContain('gacha_[ID_REDACTED]_HSR.json');
});

for (const redactIds of [false, true]) {
    test(`Bun console, logger, errors, and split writes are filtered (IDs=${redactIds})`, () => {
        const result = runScript(`
            require(${JSON.stringify(guardPath)}).installLogRedaction({ redactIds: ${redactIds} });
            const token = ${JSON.stringify(token)};
            const id = ${JSON.stringify(gameId)};
            const logger = require(${JSON.stringify(loggerPath)});
            logger.info('UID: ' + id + ' ' + token);
            logger.warn('file/bot' + token);
            logger.error('failure', Object.assign(new Error('bot' + token), { path: 'bot' + token, id }));
            logger.command({ from: { id, username: 'test' }, chat: { type: 'private' } }, '/help');
            logger.action({ from: { id, username: 'test' } }, 'profile:' + id + ':1503');
            console.log({ token, id });
            console.warn('bot' + token);
            console.error(new Error('bot' + token));
            const text = Buffer.from('中文 bot' + token + ' UID: ' + id + '\\n');
            for (let i = 0; i < text.length; i++) process.stdout.write(text.subarray(i, i + 1));
            process.stderr.write('file/bot' + token.slice(0, 12));
            process.stderr.write(token.slice(12));
            process.exit(0);
        `);
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).not.toContain(token.split(':')[1]);
        expect(output).toContain('[BOT_TOKEN_REDACTED]');
        expect(output).toContain('中文');
        if (redactIds) {
            expect(output).not.toContain(gameId);
            expect(output).toContain('[ID_REDACTED]');
        } else expect(output).toContain(gameId);
        expect(result.stderr).toEndWith('file/bot[BOT_TOKEN_REDACTED]');
    });
}

test('--redact-ids enables ID masking through the actual argv default', () => {
    const source = `
        process.argv.push('--redact-ids');
        require(${JSON.stringify(guardPath)}).installLogRedaction();
        console.log('UID ${gameId}');
    `;
    const result = runScript(source);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('UID [ID_REDACTED]');
});

for (const event of ['uncaughtException', 'unhandledRejection']) {
    test(`${event} cannot leak runtime error URLs or user payloads`, () => {
        const failure = `new Error(${JSON.stringify('bot' + token + ' UID ' + gameId)})`;
        const result = runScript(`
            require(${JSON.stringify(guardPath)}).installLogRedaction();
            ${event === 'uncaughtException'
                ? `setTimeout(() => { throw ${failure}; }, 0);`
                : `Promise.reject(${failure});`}
        `);
        expect(result.status).toBe(1);
        const output = result.stdout + result.stderr;
        expect(output).toContain(event);
        expect(output).not.toContain(token.split(':')[1]);
        expect(output).not.toContain(gameId);
    });
}
