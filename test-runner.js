/**
 * HSR-TG-Bot 统一测试引擎 (2026 核心逻辑版)
 * 该脚本由 test.js 调用，也可独立运行执行单次任务。
 * 用法: node test-runner.js <command> [args]
 */
const fs = require('fs');
const path = require('path');
const api = require('./src/api/mihomo-api');
const gachaApi = require('./src/api/gacha-api');
const gachaParser = require('./src/utils/gacha-parser');
const gachaStorage = require('./src/utils/gacha-storage');
const gachaRender = require('./src/utils/gacha-render');
const profileStorage = require('./src/utils/profile-storage');
const profileHandlers = require('./src/bot/handlers/profile');
const gachaHandlers = require('./src/bot/handlers/gacha');
const valkeyServer = require('./src/cache/server');
const cache = require('./src/cache');
const { getRelicAnalysis, getWeightsForChar } = require('./src/utils/relic-scorer');
const { getWeaponDesc } = require('./src/utils/meta');
const { loadModule } = require('./src/utils/loader');
const axios = require('axios');
require('dotenv').config();

// 终端着色工具
const green = (t) => `\x1b[32m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const cyan = (t) => `\x1b[36m${t}\x1b[0m`;
const red = (t) => `\x1b[31m${t}\x1b[0m`;
const gray = (t) => `\x1b[90m${t}\x1b[0m`;

// 清理 HTML 标签以便终端显示
const clean = (text) => text.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').trim();

function renderKeyboard(markup) {
    const kb = markup?.reply_markup?.inline_keyboard;
    if (!kb) return;
    console.log(cyan('\n--- 虚拟键盘布局 ---'));
    let btnIndex = 1;
    kb.forEach(row => {
        const rowText = row.map(btn => `[ ${btnIndex++}. ${btn.text} ]`).join('  ');
        console.log(rowText);
    });

    // 重新计算索引以输出元数据供 test.js 解析
    btnIndex = 1;
    kb.forEach(row => {
        row.forEach(btn => {
            console.log(gray(`  (Button: #${btnIndex++} "${btn.text}" -> Data: ${btn.callback_data})`));
        });
    });
}

const getCfg = (gameCode = 'HSR') => {
    const constants = loadModule(path.join(process.cwd(), 'config/game-constants.js'));
    const i18n = loadModule(path.join(process.cwd(), 'config/bot-i18n.js'));
    const settings = loadModule(path.join(process.cwd(), 'config/app-settings.js'));
    
    return {
        STATS: constants[gameCode]?.STATS || constants.HSR.STATS,
        I18N: i18n.I18N,
        PROFILE_UI: settings[gameCode]?.PROFILE_UI || settings.HSR.PROFILE_UI,
        CHAR_RULES: settings[gameCode]?.CHAR_RULES || settings.HSR.CHAR_RULES
    };
};

function getDisplayCharName(char, gameCode = 'HSR') {
    const { CHAR_RULES } = getCfg(gameCode);
    const id = String(char.id);
    if (CHAR_RULES.trailblazer_prefix && id.startsWith(CHAR_RULES.trailblazer_prefix)) {
        const isFemale = parseInt(id, 10) % 2 === 0;
        const baseName = isFemale ? CHAR_RULES.trailblazer_ui.female : CHAR_RULES.trailblazer_ui.male;
        return `${baseName} • ${char.path?.name || ''}`;
    }
    return char.name;
}

function getLogicCharName(char, gameCode = 'HSR') {
    const { CHAR_RULES } = getCfg(gameCode);
    const id = String(char.id);
    if (CHAR_RULES.trailblazer_prefix && id.startsWith(CHAR_RULES.trailblazer_prefix)) {
        return `开拓者•${char.path?.name || ''}`;
    }
    return char.name;
}

async function run() {
    const args = process.argv.slice(2);
    const cmd = args[0];

    if (!cmd) {
        console.log(`\n${cyan('--- HSR-TG-Bot 统一测试工具 (2026 增强版) ---')}`);
        console.log('\n使用方式: node test.js <指令> [参数]');
        console.log('\n可用指令:');
        console.log(`  ${green('bind')} <UID> [tgId]      - 模拟绑定账号 (默认测试 ID: 123456)`);
        console.log(`  ${green('me')} [tgId]             - [模拟 /me] 展示个人中心与已绑定信息`);
        console.log(`  ${green('profile')} <UID>         - 直接请求 API 面板并同步到本地`);
        console.log(`  ${green('update')} <UID>          - 强制更新指定 UID 数据`);
        console.log(`  ${green('detail')} <UID> <ID>     - [模拟详情按钮] 测试角色详情渲染与评分`);
        console.log(`  ${green('list')}                 - 列出本地已有的 UID 数据 (Profile/Gacha)`);
        console.log(`  ${green('gacha-url')} "<URL>"    - 测试抽卡链接抓取`);
        console.log(`  ${green('gacha-json')} <File>    - 测试 JSON 导入抽卡记录`);
        console.log(`  ${green('gacha-view')} <UID> <P>  - 测试本地抽卡数据报告渲染`);
        return;
    }

    try { await valkeyServer.start(); } catch(e) {}

    switch (cmd) {
        case 'bind': {
            const uid = args[1];
            const tgId = args[2] || 123456;
            if (!uid) return console.log(red('错误: 请提供 UID'));
            await cache.bindUid(tgId, uid, 'HSR');
            console.log(green(`✅ 绑定成功: TG(${tgId}) -> UID(${uid})`));
            break;
        }

        case 'me': {
            const tgId = args[1] || 123456;
            const uid = await cache.getBindUid(tgId, 'HSR');
            if (!uid) return console.log(yellow('用户未绑定，请先执行: node test.js bind <UID>'));
            
            console.log(cyan(`\n正在为 TG(${tgId}) 执行 [/me] 逻辑...`));
            const data = await api.getPlayerDetail(uid, false, 'HSR');
            const text = profileHandlers.renderPlayerInfo(data, 'HSR');
            console.log(`\n${green('--- Bot 回复预览 ---')}\n${clean(text)}`);
            
            const kb = profileHandlers.getMainMenuKeyboard(uid, data.characters);
            renderKeyboard(kb);
            break;
        }

        case 'profile': {
            const uid = args[1];
            if (!uid) return console.log(red('错误: 请提供 UID'));
            console.log(cyan(`\n正在请求 API 数据: ${uid}...`));
            const data = await api.getPlayerDetail(uid, true, 'HSR');
            profileStorage.saveProfile(uid, data, 'HSR');
            console.log(green(`✅ 同步完成: data/HSR/profile/${uid}.json`));
            
            console.log(`\n${green('--- 玩家信息预览 ---')}`);
            console.log(clean(profileHandlers.renderPlayerInfo(data, 'HSR')));
            const kb = profileHandlers.getShowcaseKeyboard(uid, data.characters);
            renderKeyboard(kb);
            break;
        }

        case 'update': {
            const uid = args[1];
            if (!uid) return console.log(red('错误: 请提供 UID'));
            console.log(cyan(`\n正在强制更新 UID: ${uid}...`));
            const data = await api.getPlayerDetail(uid, true, 'HSR');
            if (data && !data._isPlaceholder) {
                profileStorage.saveProfile(uid, data, 'HSR');
                console.log(green(`✅ 强制更新完成`));
            } else {
                console.log(red(`❌ 更新失败: 可能是 API 限速或 UID 不存在`));
            }
            break;
        }

        case 'detail': {
            const [_, uid, charId] = args;
            if (!uid || !charId) return console.log(red('错误: 参数不足'));
            const data = profileStorage.getProfile(uid, 'HSR');
            const char = data?.characters.find(c => String(c.id) === String(charId));
            if (!char) return console.log(red('错误: 未找到该角色数据'));
            
            const text = profileHandlers.renderCharacterDetail(char, 'HSR');
            console.log(`\n${green('--- 角色详情预览 ---')}\n${clean(text)}`);
            break;
        }

        case 'list': {
            console.log(cyan('\n--- 本地数据概览 ---'));
            const dataDir = path.join(process.cwd(), 'data', 'HSR');
            if (!fs.existsSync(dataDir)) return console.log(gray('无本地数据'));

            const profileDir = path.join(dataDir, 'profile');
            if (fs.existsSync(profileDir)) {
                console.log(yellow('\n[面板数据]'));
                fs.readdirSync(profileDir).forEach(f => {
                    if (f.endsWith('.json')) {
                        const uid = f.replace('.json', '');
                        const data = profileStorage.getProfile(uid, 'HSR');
                        console.log(` - ${uid} (${data?.player?.nickname || '未知'})`);
                    }
                });
            }

            const gachaDir = path.join(dataDir, 'gacha');
            if (fs.existsSync(gachaDir)) {
                console.log(yellow('\n[抽卡记录]'));
                fs.readdirSync(gachaDir).forEach(f => {
                    if (f.endsWith('.json')) {
                        const uid = f.replace('.json', '');
                        const logs = gachaStorage.getLocalGacha(uid, 'HSR');
                        console.log(` - ${uid} (${logs?.length || 0} 条记录)`);
                    }
                });
            }
            break;
        }

        case 'gacha-url': {
            const url = args[1];
            if (!url) return console.log(red('错误: 请输入 URL'));
            const params = await gachaParser.parseGachaUrl(url);
            if (!params) return console.log(red('错误: URL 无效'));
            const result = await gachaApi.fetchGachaLogs(params);
            if (!result || !result.uid) return console.log(red('错误: API 请求失败或过期'));
            
            const finalLogs = gachaStorage.saveAndMergeGacha(result.uid, result.logs, result);
            console.log(green(`✅ 抓取并合并成功: ${result.uid} 新增 ${result.logs.length} 条，总计 ${finalLogs.length} 条`));
            
            // 同步成功后自动展示报告和键盘
            const text = gachaRender.renderGachaText(result.uid, "11", finalLogs, result.gameCode);
            console.log(`\n${green('--- 抽卡报告预览 ---')}\n${clean(text)}`);
            renderKeyboard(gachaHandlers.getGachaKeyboard(result.uid, result.gameCode));
            break;
        }

        case 'gacha-json': {
            const filePath = args[1];
            if (!filePath || !fs.existsSync(filePath)) return console.log(red('错误: 文件不存在'));
            
            const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const { uid, logs, game_biz, region } = gachaParser.parseGachaJson(rawData);

            if (!uid || !logs || logs.length === 0) {
                return console.log(red('错误: JSON 格式不受支持或无数据'));
            }

            const finalLogs = gachaStorage.saveAndMergeGacha(uid, logs, {
                gameCode: 'HSR',
                game_biz: game_biz || 'hkrpg_cn',
                region: region
            });
            console.log(green(`✅ JSON 导入成功: UID ${uid}，导入 ${logs.length} 条，总计 ${finalLogs.length} 条`));
            
            const text = gachaRender.renderGachaText(uid, "11", finalLogs, 'HSR');
            console.log(`\n${green('--- 抽卡报告预览 ---')}\n${clean(text)}`);
            renderKeyboard(gachaHandlers.getGachaKeyboard(uid, 'HSR'));
            break;
        }

        case 'gacha-view': {
            const [_, uid, pool] = args;
            if (!uid) return console.log(red('错误: 请提供 UID'));
            const logs = gachaStorage.getLocalGacha(uid, 'HSR');
            if (!logs) return console.log(red('错误: 本地无记录'));
            const text = gachaRender.renderGachaText(uid, pool || "11", logs, 'HSR');
            console.log(`\n${green('--- 抽卡报告预览 (' + (pool || '11') + ') ---')}\n${clean(text)}`);

            const kb = gachaHandlers.getGachaKeyboard(uid, 'HSR');
            renderKeyboard(kb);
            break;
        }

        case 'callback': {
            const data = args[1];
            if (!data) return console.log(red('错误: 请提供 Callback Data'));
            console.log(gray(`[模拟回调] 收到信号: ${data}`));

            if (data.startsWith('profile:')) {
                const [_, uid, charId] = data.split(':');
                const profile = profileStorage.getProfile(uid, 'HSR');
                const char = profile?.characters.find(c => String(c.id) === String(charId));
                if (char) {
                    const text = profileHandlers.renderCharacterDetail(char, 'HSR');
                    console.log(`\n${green('--- 角色详情预览 ---')}\n${clean(text)}`);
                    const kb = profileHandlers.getShowcaseKeyboard(uid, profile.characters);
                    renderKeyboard(kb);
                } else {
                    console.log(red('错误: 回调数据指向的角色不存在'));
                }
            } 
            else if (data.startsWith('me_showcase:')) {
                const uid = data.split(':')[1];
                const profile = profileStorage.getProfile(uid, 'HSR');
                console.log(cyan(`\n--- 角色展柜 (UID: ${uid}) ---`));
                const kb = profileHandlers.getShowcaseKeyboard(uid, profile.characters);
                renderKeyboard(kb);
            }
            else if (data.startsWith('gacha_pool:')) {
                const [_, game, uid, poolId] = data.split(':');
                const logs = gachaStorage.getLocalGacha(uid, game);
                console.log(gachaRender.renderGachaText(uid, poolId, logs, game));
                const kb = gachaHandlers.getGachaKeyboard(uid, game);
                renderKeyboard(kb);
            }
            else if (data.startsWith('back_to_me:')) {
                const uid = data.split(':')[1];
                const data2 = await api.getPlayerDetail(uid, false, 'HSR');
                console.log(green('\n--- 返回主页 ---'));
                console.log(clean(profileHandlers.renderPlayerInfo(data2, 'HSR')));
                renderKeyboard(profileHandlers.getMainMenuKeyboard(uid, data2.characters));
            }
            break;
        }


        default:
            console.log(red('未知指令'));
    }

    process.exit(0);
}

run().catch(err => {
    console.error(red(`\n程序运行崩溃: ${err.message}`));
    console.error(err.stack);
    process.exit(1);
});
