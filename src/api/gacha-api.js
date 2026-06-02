// src/api/gacha-api.js
const axios = require('axios');
const logger = require('../utils/logger');

async function fetchGachaLogs(rawUrl) {
    try {
        // 1. 解析原始 URL
        const urlObj = new URL(rawUrl.trim());
        const searchParams = urlObj.searchParams;

        const { TEXT, GACHA } = require('../../config/ui-config');

        // 2. 检查关键参数是否存在
        if (!searchParams.get('authkey')) {
            throw new Error(TEXT.sys.authkey_error);
        }

        // 3. 定义后端 API 基础路径
        // 注意：无论前端域名是什么，后端抓取统一走这个接口
        const baseApi = "https://api-takumi.mihoyo.com/common/gacha_record/api/getGachaLog";

        const gachaTypes = Object.entries(GACHA.pools).map(([id, name]) => ({ id, name }));
        let allLogs = [];
        let uid = "";

        for (const type of gachaTypes) {
            let endId = "0";
            logger.info(TEXT.gacha.fetching.replace('{name}', type.name));

            while (true) {
                // 构造新的请求参数，保留原链接中的所有身份校验参数
                const query = new URLSearchParams(searchParams);
                query.set('gacha_type', type.id);
                query.set('size', '20');
                query.set('end_id', endId);
                // 确保语言正确
                query.set('lang', 'zh-cn');

                const apiUrl = `${baseApi}?${query.toString()}`;
                const res = await axios.get(apiUrl);

                if (res.data.retcode !== 0) {
                    logger.error(`抓取记录失败 (API 返回): ${res.data.message}`);
                    break; 
                }

                const list = res.data.data.list;
                if (!list || list.length === 0) break;

                if (!uid) uid = list[0].uid;
                allLogs.push(...list);

                endId = list[list.length - 1].id;
                if (list.length < 20) break;

                await new Promise(r => setTimeout(r, 250)); // 稍微延时防止频率限制
            }
        }

        return { uid, logs: allLogs };
    } catch (e) {
        logger.error('抽卡记录抓取发生异常', e.message);
        return null;
    }
}

module.exports = { fetchGachaLogs };
