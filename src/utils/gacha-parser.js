const axios = require('axios');
const logger = require('./logger');

/**
 * 追踪重定向以获取真实的长链接
 */
async function fetchRealLongUrl(shortUrl) {
    try {
        const res = await axios.get(shortUrl, {
            maxRedirects: 5,
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        return res.request.res.responseUrl || res.config.url || shortUrl;
    } catch (e) {
        logger.error(`追踪短链失败: ${shortUrl}`, e.message);
        return shortUrl;
    }
}

/**
 * 纯净 ASCII 提取 (参考 Rust 逻辑)
 * 只保留 URL 允许的可见 ASCII 字符，遇到非法符号即停止
 */
function cleanUrl(str) {
    if (!str) return "";
    let result = "";
    const isUrlChar = (c) => {
        const code = c.charCodeAt(0);
        return (code >= 33 && code <= 126);
    };

    for (let i = 0; i < str.length; i++) {
        if (isUrlChar(str[i])) {
            result += str[i];
        } else if (result.length > 0) {
            break;
        }
    }
    return result;
}

/**
 * 解析并清洗 URL 输入
 */
async function parseGachaUrl(userInput) {
    let targetStr = userInput.trim();

    // 1. 域名识别与短链追踪
    const hsrDomains = /webstatic|hk4e-api|mihoyo|hoyoverse|api-takumi|public-operation-hkrpg/;
    const isStandardGacha = hsrDomains.test(targetStr) && /authkey=/.test(targetStr);
    const isHttp = /^https?:\/\//.test(targetStr);
    
    if (isHttp && !isStandardGacha) {
        targetStr = await fetchRealLongUrl(targetStr); 
    }

    // 2. 符号纠偏与 ASCII 清洗
    targetStr = targetStr.replace(/[〈〈]=/g, "&");
    targetStr = cleanUrl(targetStr);

    // 3. 参数解析与 Hash 处理
    let queryString = targetStr;
    if (targetStr.includes("?")) {
        queryString = targetStr.split("?")[1];
    }
    if (queryString.includes("#/")) {
        const parts = queryString.split("#/");
        queryString = parts[0];
        if (parts[1] && parts[1].includes("=")) {
            queryString += "&" + parts[1];
        }
    }

    const params = new URLSearchParams(queryString);
    let authkey = params.get('authkey');
    if (!authkey) return null;

    // 清除 authkey 尾部 junk (参考 miao-plugin)
    authkey = authkey.replace(/#\/|#\/log/g, "");
    params.set('authkey', authkey);
    
    return params;
}

/**
 * 启发式 JSON 数据提取器 (从各种格式中提取 UID 和记录)
 */
function parseGachaJson(data) {
    let uid = "";
    let logs = [];
    let game_biz = "";
    let region = "";

    // 1. 优先识别标准 SRGF / UIGF 格式
    if (data.info && (data.info.srgf_version || data.info.uigf_version)) {
        uid = data.info.uid;
        game_biz = data.info.game_biz;
        region = data.info.region;
        logs = data.list || [];
        return { uid: String(uid), logs, game_biz, region };
    }

    // 2. 识别特定工具格式 (如 Yunzai 的 hkrpg 节点)
    if (data.hkrpg && Array.isArray(data.hkrpg)) {
        // Yunzai 的 hkrpg 是一个数组，每个元素包含 uid 和 list
        const entry = data.hkrpg[0];
        if (entry && entry.list) {
            uid = entry.uid;
            logs = entry.list;
            return { uid: String(uid), logs };
        }
    }

    // 3. 兜底：深度启发式搜索
    function findLogs(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            const sample = obj[0];
            if (sample && sample.id && (sample.name || sample.item_id) && sample.gacha_type) {
                logs = obj;
                if (!uid) uid = sample.uid;
            }
        }
        for (const key in obj) {
            if (uid && logs.length > 0) break;
            findLogs(obj[key]);
        }
    }

    if (data.info?.uid) uid = data.info.uid;
    else if (data.uid) uid = data.uid;

    findLogs(data);

    return { uid: String(uid), logs };
}

module.exports = { parseGachaUrl, parseGachaJson };
