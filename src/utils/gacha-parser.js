// src/utils/gacha-parser.js
/**
 * 抽卡数据解析工具
 * 负责从不同来源（URL 链接、JSON 文件）解析、清洗并规范化抽卡数据
 */
const axios = require('axios');
const logger = require('./logger');

/**
 * 追踪并获取短链接后的真实长链接 (防止因 URL 重定向导致解析失败)
 * @param {string} shortUrl - 原始短链接
 * @returns {Promise<string>} 真实的 URL 或原始 URL
 */
async function fetchRealLongUrl(shortUrl) {
    try {
        if (!shortUrl.startsWith('https://')) return shortUrl;
        
        const res = await axios.get(shortUrl, {
            maxRedirects: 5,
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const finalUrl = res.request.res.responseUrl || res.config.url || shortUrl;
        
        // 校验重定向后的 URL 是否合法
        if (!finalUrl.startsWith('https://')) return shortUrl;
        
        return finalUrl;
    } catch (e) {
        logger.error(`追踪短链失败: ${shortUrl}`, e.message);
        return shortUrl;
    }
}

/**
 * 清洗 URL 字符串，仅保留可见的合法 ASCII 字符
 * @param {string} str - 待处理的原始 URL 字符串
 * @returns {string} 清洗后的 URL
 */
function cleanUrl(str) {
    if (!str) return "";
    let result = "";
    
    // 检查字符是否为合法的 URL 可见 ASCII 字符
    const isUrlChar = (c) => {
        const code = c.charCodeAt(0);
        return (code >= 33 && code <= 126);
    };

    for (let i = 0; i < str.length; i++) {
        if (isUrlChar(str[i])) {
            result += str[i];
        } else if (result.length > 0) {
            // 遇到非法字符即停止（通常是 URL 末尾的乱码）
            break;
        }
    }
    return result;
}

/**
 * 解析并清洗用户输入的抽卡链接，提取查询参数
 * @param {string} userInput - 用户发送的原始消息内容
 * @returns {Promise<URLSearchParams|null>} 解析后的 URL 查询参数对象或 null
 */
async function parseGachaUrl(userInput) {
    let targetStr = userInput.trim();

    // 1. 域名识别与短链追踪
    const hsrDomains = /webstatic|hk4e-api|mihoyo|hoyoverse|api-takumi|public-operation-hkrpg/;
    const isStandardGacha = hsrDomains.test(targetStr) && /authkey=/.test(targetStr);
    const isHttp = /^https?:\/\//.test(targetStr);
    
    // 若为链接但非标准抽卡链接，尝试追踪跳转
    if (isHttp && !isStandardGacha) {
        targetStr = await fetchRealLongUrl(targetStr); 
    }

    // 2. 符号纠偏与 ASCII 清洗
    targetStr = targetStr.replace(/[〈〈]=/g, "&"); // 修正部分可能存在的编码错误
    targetStr = cleanUrl(targetStr);

    // 3. 参数解析与 Hash 处理 (兼容部分前端框架的 Hash 路由格式)
    let queryString = targetStr;
    if (targetStr.includes("?")) {
        queryString = targetStr.split("?")[1];
    }
    // 将 Hash 部分转为参数解析
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

    // 清除 authkey 尾部可能存在的 junk 符号 (参考 miao-plugin)
    authkey = authkey.replace(/#\/|#\/log/g, "");
    params.set('authkey', authkey);
    
    return params;
}

/**
 * 启发式 JSON 数据解析器：从各种可能的格式中识别并提取 UID 和抽卡列表
 * @param {Object} data - 从 JSON 文件解析出的原始对象
 * @returns {Object} 包含 { uid, logs, game_biz, region } 的规范化对象
 */
function parseGachaJson(data) {
    let uid = "";
    let logs = [];
    let game_biz = "";
    let region = "";

    // 1. 优先识别并解析标准 SRGF / UIGF 格式
    if (data.info && (data.info.srgf_version || data.info.uigf_version)) {
        uid = String(data.info.uid).replace(/[^0-9]/g, '');
        game_biz = data.info.game_biz;
        region = data.info.region;
        logs = data.list || [];
        return { uid, logs, game_biz, region };
    }

    // 2. 识别其他兼容的特定导出格式 (如旧版 Yunzai 等)
    if (data.hkrpg && Array.isArray(data.hkrpg)) {
        const entry = data.hkrpg[0];
        if (entry && entry.list) {
            uid = String(entry.uid).replace(/[^0-9]/g, '');
            logs = entry.list;
            return { uid, logs };
        }
    }

    // 3. 兜底：深度启发式搜索 (递归扫描 JSON 对象中是否存在符合结构的列表)
    function findLogs(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            // 检查数组样本是否符合抽卡记录结构
            const sample = obj[0];
            if (sample && sample.id && (sample.name || sample.item_id) && sample.gacha_type) {
                logs = obj;
                if (!uid) uid = String(sample.uid).replace(/[^0-9]/g, '');
            }
        }
        for (const key in obj) {
            if (uid && logs.length > 0) break;
            findLogs(obj[key]);
        }
    }

    // 预先提取 UID
    if (data.info?.uid) uid = String(data.info.uid).replace(/[^0-9]/g, '');
    else if (data.uid) uid = String(data.uid).replace(/[^0-9]/g, '');

    findLogs(data);

    return { uid, logs };
}

module.exports = { parseGachaUrl, parseGachaJson };
