// 仅记录允许的错误类型和代码，不输出可能含 token / 用户数据的 URL、消息或堆栈。
const ERROR_NAMES = new Set([
    'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError',
    'FetchError', 'TelegramError', 'TimeoutError', 'AbortError'
]);
const NETWORK_CODES = new Set([
    'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT',
    'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH',
    'ERR_SOCKET_CLOSED', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'
]);

function summarizeError(err) {
    const summary = { name: ERROR_NAMES.has(err?.name) ? err.name : 'UnknownError' };
    const code = err?.code;
    if (NETWORK_CODES.has(code) || (Number.isInteger(code) && code >= 400 && code <= 599)) {
        summary.code = code;
    }
    return summary;
}

module.exports = { summarizeError };
