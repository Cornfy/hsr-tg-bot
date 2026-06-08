// config/bot-i18n.js

const WELCOME_MSG = `
👋 <b>欢迎使用 HSR-TG-Bot！</b>

这是一个专为《崩坏：星穹铁道》设计的 Telegram 小助手，支持查询角色面板和抽卡分析。

🚀 <b>核心功能：</b>
• /bind <code>[UID]</code> - <b>绑定 HSR 游戏账号</b>
• /me - <b>个人中心</b>，一站式访问面板与抽卡
• /profile <code>[UID]</code> - <b>查询角色面板</b>，需在游戏内加入展柜并公开
• /gacha <code>[URL/JSON]</code> - <b>抽卡统计分析</b>，支持链接、JSON 文件导入)

💡 <b>提示：</b>
- 点击下方菜单按钮可快速发起指令。
- 抽卡数据同步后会自动合并存储，不用担心记录丢失。
- 绑定 UID 后，您的角色展柜数据将持久化存储。
`;

module.exports = {
    WELCOME_MSG,

    // --- 业务 UI 文本模版 (语义化层级，按逻辑顺序整理) ---
    I18N: {
        // 1. 公共 UI/状态提示
        COMMON: {
            LOADING: "⏳ 正在请求数据，请稍候...",
            ERROR_API: "❌ 无法获取数据，请检查网络或 UID 是否正确。",
            ERROR_PERMISSION: "❌ 权限不足：该指令仅限配置文件中指定的管理员使用。",
            KEYBOARD: {
                BACK_TO_HOME: "⬅️ 返回主页"
            }
        },

        // 2. 鉴权与用户绑定
        AUTH: {
            BIND_PROMPT: "❓ 请输入 9 位 UID 进行绑定，或直接回复本条消息。\n例如：<code>/bind 100000001</code>",
            BINDING: "⏳ 正在绑定 UID {uid}...",
            BIND_SUCCESS: "✅ <b>UID {uid} 绑定成功！</b>\n正在尝试从远程同步数据，请稍候...",
            UPDATE_NEED_BIND: "⚠️ 请先绑定 UID 后再使用更新功能。",
            UPDATE_SYNCING: "🔄 正在同步最新数据...",
            UPDATE_DONE: "✅ 数据已完成强制刷新并写入硬盘。",
            UPDATE_FAILED: "❌ 刷新失败，请稍后重试。",
            ME_NOT_BOUND: "❓ 你还没有绑定 UID，请发送 <code>/bind [你的UID]</code>",
        },

        // 3. 玩家数据与展柜
        PLAYER_CENTER: {
            DASHBOARD: {
                TITLE: "🏠 <b>个人数据中心</b>\n",
                QUEUING: "⏳ <b>正在排队获取实时数据，请稍后同步...</b>\n",
                FALLBACK: "⚠️ <b>提示: 当前 API 服务繁忙，显示为缓存数据</b>\n",
                INFO: "👤 玩家: <b>{nickname}</b>\n🆔 UID: <code>{uid}</code>\n📊 等级: Lv.{level}\n\n🏆 成就: {achievement} | 🎭 角色: {avatar}\n请选择功能模块：",
                SYNC_SUCCESS: "\n✅ 数据同步已完成",
                SYNC_IN_PROGRESS: "\n🔄 正在同步数据...",
                SYNC_FAILED_HINT: "\n❌ 实时同步暂时失败，你可以稍后点击同步按钮重试。",
                SYNC_BACK_FALLBACK: "\n⚠️ 数据同步失败，已回退至本地缓存。",
            }
        },
        PROFILE: {
            KEYBOARD: {
                SHOWCASE: "🎭 角色展柜",
                GACHA_STATS: "📊 抽卡统计",
                SYNC: "🔄 更新玩家信息"
            }
        },
        CHAR_PANEL: {
            PROMPT: "❓ 请输入 9 位 UID 或回复包含 UID 的消息。\n用法: <code>/profile 100000001</code>",
            INVALID_UID: "❌ <b>输入格式错误</b>\n你输入的 <code>{input}</code> 不是合法的 9 位 UID，请重新输入。",
            SHOWCASE_TITLE: "🎭 <b>角色展柜</b> (UID: {uid})\n请选择角色查看详情：",
            ONLINE_ICON: "☁️ ",
            SEARCH_RES: "👤 <b>{nickname}</b> (UID: {uid})\n",
            NO_CHARACTERS: "⚠️ 暂无角色数据，请检查展柜是否公开。",
            DATA_EXCEPTION: "⚠️ 数据结构异常，无法显示玩家信息。",
            CHAR_DATA_MISSING: "⚠️ 角色数据已缺失，请尝试刷新面板。",
            SYNC_FAIL: "❌ 数据后台同步失败",
            EDIT_FAIL: "❌ 编辑角色详情消息失败",
            DETAIL: {
                TITLE: "✨ <b>{name}</b> (Lv.{level} {rank}命)\n◈ 命途: {path} | 属性: {element}\n\n",
                LIGHTCONE: "🗡️ <b>{name}</b> (精{rank})\n",
                RELIC_MAIN: "\n{slot} [{set}]\n├ 主: {main}: {val} | 有效词条数: {v}v\n",
                RELIC_SUB: "{prefix}{name} +{val} {mark} {cont}\n",
                RELIC_CONT_VALUE: "{val}v",
                RELIC_CONT_EMPTY: "-",
                SCORE_FOOTER: "\n总有效词条数: {total}v ({rating})\n有效词条权重: {weights}",
            }
        },

        // 4. 抽卡分析
        GACHA: {
            LOADING: "⏳ 正在解析并合并抽卡记录...",
            IMPORT_SUCCESS: "✅ 记录导入成功！\nUID: <code>{uid}</code> (检测到 {count} 条记录)",
            IMPORT_FAIL: "❌ 导入失败: {error}",
            ERROR_NO_DATA: "未在文件中找到有效的星铁抽卡记录数据。",
            INVALID_URL: "❌ <b>输入无效</b>\n\n你发送的内容中没有包含有效的抽卡记录链接。\n链接通常以 <code>https://...</code> 开头，且包含 <code>authkey</code> 等关键特征。",
            HELP_PROMPT: "\n📊 <b>抽卡记录数据同步</b>\n\n请直接<b>回复本条消息</b>并发送抽卡链接，或直接上传 <code>.json</code> 文件。\n\n💡 只要是有效的 URL，机器人都会尝试进行抓取。\n",
            API_FAILED: "❌ 同步失败：链接无效、过期或 API 解析异常。请确保你复制的是完整的历史记录链接。",
            UNSUPPORTED_GAME: "❌ 暂不支持 <b>{name}</b> ({code}) 的统计分析。\n\n目前仅支持《崩坏：星穹铁道》的抽卡分析。",
            EMPTY_DATA: "⚠️ 该卡池暂无数据记录。",
            FETCHING: "[Gacha] 正在抓取{name}池...",
            REPORT: {
                TITLE: "📊 <b>{pool}分析</b>\n<b>UID: <code>{uid}</code></b>\n运气评价：<b>{luck}</b>\n\n",
                STATS: "<b>📈 核心数据</b>\n• 抽卡总数: <b>{total}</b> (等价 <b>{cost}</b> 星琼)\n• 已出金卡: <b>{gold}</b> | 歪: <b>{wai}</b>\n• 均金抽数: <b>{avg}</b> 抽/金\n• 均UP抽数: <b>{avg_up}</b> 抽/UP\n• 出紫频率: <b>{p_rate}%</b> ({p_count}张)\n\n",
                PITY: "<b>⏳ 近期进度</b>\n• 已累积 <b>{pity}</b> 抽未出金\n• 进度: <code>{bar}</code>\n\n",
                HISTORY: "<b>✨ 历史出金记录</b>\n<pre>{table}</pre>\n",
                MORE: "<i>... 还有 {count} 条记录未显示</i>\n"
            },
            KEYBOARD: {
                CHAR_POOL: "🎭 角色活动",
                WEAPON_POOL: "🗡️ 光锥活动",
                COLLAB_CHAR: "🤝 联动角色",
                COLLAB_WEAPON: "🏹 联动光锥",
                STANDARD_POOL: "⏳ 常驻跃迁",
                BACK_TO_ME: "⬅️ 返回主页",
                EXPORT: "📤 导出记录"
            },
            EXPORT_MESSAGES: {
                LOADING: "正在导出...",
                EMPTY: "暂无抽卡记录数据",
                ERROR: "导出失败，请稍后再试。错误: {error}"
            }
        },

        // 5. 系统通知
        SYSTEM: {
            RELOAD_SUCCESS: "🚀 【重载】全量业务逻辑与配置已完成热更新！",
            RELOAD_ERROR: "❌ 重载失败: {error}",
            AUTHKEY_ERROR: "链接中未包含 AuthKey",
        }
    }
};
