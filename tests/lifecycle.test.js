const { test, expect } = require('bun:test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { summarizeError } = require('../src/utils/error-summary');

for (const scenario of [
    'polling-reset', 'startup-failure', 'polling-return',
    'handler-failure', 'admin-failure', 'cleanup-failure'
]) {
    test(`${scenario}: exits with failure despite an active connection handle`, () => {
        const result = spawnSync(process.execPath, [
            '--no-env-file',
            path.join(__dirname, 'fixtures/bootstrap.cjs'), scenario
        ], { encoding: 'utf8', timeout: 5000, env: {} });

        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(result.stdout).toContain('PRIVATE_VALKEY_STOP_REQUESTED');
        expect(result.stdout).toContain('退出并等待进程管理器重启');
        const output = result.stdout + result.stderr;
        for (const privateField of [
            'PRIVATE_ERROR_MESSAGE', 'PRIVATE_REQUEST_URL', 'PRIVATE_UPDATE', 'PRIVATE_CLEANUP_ERROR'
        ]) expect(output).not.toContain(privateField);
        if (scenario !== 'polling-return') expect(output).toContain('ECONNRESET');
        if (scenario === 'admin-failure') expect(output).toContain('设置管理员菜单失败');
        if (scenario === 'handler-failure') expect(output).toContain('Telegram 消息处理失败');
    });
}

test('error summaries retain diagnostic codes and discard all free-form fields', () => {
    expect(summarizeError(Object.assign(new TypeError('PRIVATE'), {
        code: 'ECONNRESET', path: 'PRIVATE', payload: 'PRIVATE'
    }))).toEqual({ name: 'TypeError', code: 'ECONNRESET' });
    expect(summarizeError({ name: 'TelegramError', code: 409, description: 'PRIVATE' }))
        .toEqual({ name: 'TelegramError', code: 409 });
    expect(summarizeError({ name: 'PRIVATE', code: 'PRIVATE' })).toEqual({ name: 'UnknownError' });
    expect(summarizeError(null)).toEqual({ name: 'UnknownError' });
});
