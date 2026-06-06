// src/api/gacha-api.js
/**
 * 抽卡记录接口模块
 * 负责解析用户提供的认证参数，探测游戏区域，并分页获取全量抽卡记录
 */
const axios = require('axios');
const logger = require('../utils/logger');
const { loadModule } = require('../utils/loader');
const path = require('path');

/**
 * 获取并合并用户所有卡池的抽卡记录
 * @param {URLSearchParams} params - 解析后的 URL 认证参数 (包含 authkey, game_biz 等)
 * @returns {Promise<Object|null>} 包含 { uid, logs, gameCode, region, game_biz } 的结果对象，失败返回 null
 */
async function fetchGachaLogs(params) {
    try {
        const fullConstants = loadModule(path.join(process.cwd(), 'config/game-constants.js'));
        const { I18N } = loadModule(path.join(process.cwd(), 'config/bot-i18n.js'));

        // 1. 校验核心鉴权参数
        if (!params.get('authkey')) {
            throw new Error(I18N.SYSTEM.AUTHKEY_ERROR);
        }

        // 确定游戏代码 (基于 biz 前缀判断)
        const gameBiz = params.get('game_biz') || 'hkrpg_cn';
        let gameCode = 'HSR';
        if (gameBiz.startsWith('hk4e')) gameCode = 'GI';
        if (gameBiz.startsWith('nap')) gameCode = 'ZZZ';

        let region = params.get('region');
        const gameConst = fullConstants[gameCode] || fullConstants.HSR;
        
        // 智能探测用户所在区域 (部分接口需要明确的 region 参数)
        if (!region) {
            const testRegions = ['prod_gf_cn', 'prod_official_usa', 'cn_gf01', 'os_usa'];
            for (const r of testRegions) {
                const isGlobal = !['prod_gf_cn', 'prod_qd_cn', 'cn_gf01', 'cn_qd01'].includes(r);
                const gateways = fullConstants.GACHA_API_GATEWAYS[gameCode] || fullConstants.GACHA_API_GATEWAYS.HSR;
                const baseUrl = isGlobal ? gateways.global : gateways.cn;
                
                const testQuery = new URLSearchParams(params);
                const testPool = gameCode === 'GI' ? '301' : '11';
                testQuery.set('gacha_type', testPool);
                testQuery.set('size', '5');
                testQuery.set('region', r);

                try {
                    // 发送试探请求以验证区域
                    const res = await axios.get(`${baseUrl}/getGachaLog?${testQuery.toString()}`);
                    if (res.data.retcode === 0 && res.data.data?.region) {
                        region = res.data.data.region;
                        params.set('region', region);
                        break;
                    }
                } catch (e) {
                    // 忽略试探性请求失败
                }
            }
        }

        // 目前限制仅支持 HSR
        if (gameCode !== 'HSR') {
            logger.warn(`暂不支持的游戏类型: ${gameCode}`);
            return { error: 'UNSUPPORTED_GAME', gameCode };
        }

        if (!region) region = 'prod_gf_cn';
        const isGlobal = !['prod_gf_cn', 'prod_qd_cn', 'cn_gf01', 'cn_qd01'].includes(region);

        // 2. 获取 API 网关并循环遍历所有卡池
        const gateways = fullConstants.GACHA_API_GATEWAYS[gameCode];
        const baseUrl = isGlobal ? gateways.global : gateways.cn;

        const gachaTypes = Object.entries(gameConst.GACHA_POOLS).map(([id, name]) => ({ id, name }));
        let allLogs = [];
        let uid = "";

        // 分别抓取不同类型的卡池记录
        for (const type of gachaTypes) {
            let endId = "0"; // 用于分页控制
            const isCollab = ["21", "22"].includes(type.id); // 联动卡池 API 路径不同
            const apiMethod = isCollab ? "getLdGachaLog" : "getGachaLog";
            
            logger.info(I18N.GACHA.FETCHING.replace('{name}', type.name));

            // 分页循环抓取
            while (true) {
                const query = new URLSearchParams(params);
                query.set('gacha_type', type.id);
                query.set('size', '20');
                query.set('end_id', endId);
                query.set('lang', 'zh-cn');
                
                const apiUrl = `${baseUrl}/${apiMethod}?${query.toString()}`;
                const res = await axios.get(apiUrl);

                // 错误处理：retcode 0 为成功
                if (res.data.retcode !== 0) {
                    if (res.data.retcode !== -101) {
                        logger.error(`抓取记录失败 (API ${res.data.retcode}): ${res.data.message}`);
                    }
                    break; // 停止该卡池抓取
                }

                const list = res.data.data.list;
                if (!list || list.length === 0) break; // 数据抓取完毕

                if (!uid) uid = list[0].uid;
                allLogs.push(...list);

                // 更新分页控制 ID
                endId = list[list.length - 1].id;
                // 若返回数量小于请求数量，说明已到尾页
                if (list.length < 20) break;

                // 避免请求过于频繁触发 API 限流
                await new Promise(r => setTimeout(r, 300));
            }
        }

        return { 
            uid, 
            logs: allLogs, 
            gameCode, 
            region, 
            game_biz: gameBiz 
        };
    } catch (e) {
        logger.error('抽卡记录抓取发生异常', e.message);
        return null;
    }
}

module.exports = { fetchGachaLogs };
