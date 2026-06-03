const axios = require('axios');
const logger = require('../utils/logger');
const { loadModule } = require('../utils/loader');
const path = require('path');

async function fetchGachaLogs(params) {
    try {
        const CONST = loadModule(path.join(process.cwd(), 'config/game-constants.js'));
        const { I18N } = loadModule(path.join(process.cwd(), 'config/bot-i18n.js'));

        // 1. 检查关键参数
        if (!params.get('authkey')) {
            throw new Error(I18N.SYSTEM.AUTHKEY_ERROR);
        }

        // 确定游戏代码 (HSR, GI, ZZZ)
        const gameBiz = params.get('game_biz') || 'hkrpg_cn';
        let gameCode = 'HSR';
        if (gameBiz.startsWith('hk4e')) gameCode = 'GI';
        if (gameBiz.startsWith('nap')) gameCode = 'ZZZ';

        let region = params.get('region');
        
        // 智能区域探测
        if (!region) {
            const testRegions = ['prod_gf_cn', 'prod_official_usa', 'cn_gf01', 'os_usa'];
            for (const r of testRegions) {
                const isGlobal = !['prod_gf_cn', 'prod_qd_cn', 'cn_gf01', 'cn_qd01'].includes(r);
                const gateways = CONST.GACHA_API_GATEWAYS[gameCode] || CONST.GACHA_API_GATEWAYS.HSR;
                const baseUrl = isGlobal ? gateways.global : gateways.cn;
                
                const testQuery = new URLSearchParams(params);
                const testPool = gameCode === 'GI' ? '301' : '11';
                testQuery.set('gacha_type', testPool);
                testQuery.set('size', '5');
                testQuery.set('region', r);

                try {
                    const res = await axios.get(`${baseUrl}/getGachaLog?${testQuery.toString()}`);
                    if (res.data.retcode === 0 && res.data.data?.region) {
                        region = res.data.data.region;
                        params.set('region', region);
                        break;
                    }
                } catch (e) {}
            }
        }

        // 只要不是 HSR，暂时提示不支持
        if (gameCode !== 'HSR') {
            logger.warn(`暂不支持的游戏类型: ${gameCode}`);
            return { error: 'UNSUPPORTED_GAME', gameCode };
        }

        if (!region) region = 'prod_gf_cn';
        const isGlobal = !['prod_gf_cn', 'prod_qd_cn', 'cn_gf01', 'cn_qd01'].includes(region);

        // 2. 从配置中动态获取 API 网关
        const gateways = CONST.GACHA_API_GATEWAYS[gameCode];
        const baseUrl = isGlobal ? gateways.global : gateways.cn;

        const gachaTypes = Object.entries(CONST.GACHA_POOLS).map(([id, name]) => ({ id, name }));
        let allLogs = [];
        let uid = "";

        for (const type of gachaTypes) {
            let endId = "0";
            const isCollab = ["21", "22"].includes(type.id);
            const apiMethod = isCollab ? "getLdGachaLog" : "getGachaLog";
            
            logger.info(I18N.GACHA.FETCHING.replace('{name}', type.name));

            while (true) {
                const query = new URLSearchParams(params);
                query.set('gacha_type', type.id);
                query.set('size', '20');
                query.set('end_id', endId);
                query.set('lang', 'zh-cn');
                
                const apiUrl = `${baseUrl}/${apiMethod}?${query.toString()}`;
                const res = await axios.get(apiUrl);

                if (res.data.retcode !== 0) {
                    if (res.data.retcode !== -101) {
                        logger.error(`抓取记录失败 (API ${res.data.retcode}): ${res.data.message}`);
                    }
                    break; 
                }

                const list = res.data.data.list;
                if (!list || list.length === 0) break;

                if (!uid) uid = list[0].uid;
                allLogs.push(...list);

                endId = list[list.length - 1].id;
                if (list.length < 20) break;

                await new Promise(r => setTimeout(r, 300));
            }
        }

        return { uid, logs: allLogs, gameCode };
    } catch (e) {
        logger.error('抽卡记录抓取发生异常', e.message);
        return null;
    }
}

module.exports = { fetchGachaLogs };
