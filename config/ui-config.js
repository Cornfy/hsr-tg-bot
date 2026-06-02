// config/ui-config.js

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

    // --- 属性定义 [全称, 简称] ---
    STATS: {
        hp: ["生命值", "生命"],
        atk: ["攻击力", "攻击"],
        def: ["防御力", "防御"],
        spd: ["速度", "速度"],
        crit_rate: ["暴击率", "暴击"],
        crit_dmg: ["暴击伤害", "爆伤"],
        break_dmg: ["击破特攻", "击破"],
        all_dmg: ["属性伤害提高", "增伤"],
        sp_rate: ["能量恢复效率", "充能"],
        heal_rate: ["治疗量加成", "治疗"],
        effect_hit: ["效果命中", "命中"],
        effect_res: ["效果抵抗", "抵抗"],
        // 伤害类型
        physical_dmg: ["物理伤害加成", "物伤"],
        fire_dmg: ["火属性伤害加成", "火伤"],
        ice_dmg: ["冰属性伤害加成", "冰伤"],
        lightning_dmg: ["雷属性伤害加成", "雷伤"],
        wind_dmg: ["风属性伤害加成", "风伤"],
        quantum_dmg: ["量子属性伤害加成", "量子"],
        imaginary_dmg: ["虚数属性伤害加成", "虚数"],
        // 特殊
        pc: ["百分比", "%"]
    },

    // --- 面板配置 ---
    PROFILE: {
        main: ['hp', 'atk', 'def', 'spd', 'crit_rate', 'crit_dmg'],
        other: ['all_dmg', 'break_dmg', 'sp_rate', 'effect_hit', 'effect_res', 'heal_rate'],
        dmg_bonus: ['physical_dmg', 'fire_dmg', 'ice_dmg', 'lightning_dmg', 'wind_dmg', 'quantum_dmg', 'imaginary_dmg'],
        slots: { 1: '头', 2: '手', 3: '躯', 4: '鞋', 5: '球', 6: '绳' }
    },

    // --- 抽卡配置 ---
    GACHA: {
        pools: {
            "11": "角色活动",
            "21": "角色活动2",
            "12": "光锥活动",
            "22": "光锥活动2",
            "1": "常驻跃迁"
        },
        standard: {
            chars: [
                "姬子", "瓦尔特", "布洛妮娅", "杰帕德", "克拉拉", "彦卿", "白露",
                "希儿", "符玄", "刃", "银狼", "银枝", "云璃"
            ],
            weapons: [
                "无可取代的东西", "但战斗还未结束", "以世界之名", "时节不居", "如泥酣眠", "制胜的瞬间", "银河铁道之夜"
            ]
        },
        ui: {
            bar_full: "█",
            bar_empty: "░",
            thresholds: { lucky: 47, normal: 68 },
            labels: { none: "未出金", lucky: "欧皇", normal: "正常", bad: "非酋" },
            colors: { lucky: "🟢", normal: "🟡", bad: "🔴" }
        }
    },

    // --- 业务 UI 文本模版 (分组管理) ---
    TEXT: {
        common: {
            loading: "⏳ 正在请求数据，请稍候...",
            error_api: "❌ 无法获取数据，请检查网络或 UID 是否正确。",
            error_permission: "❌ 权限不足：该指令仅限配置文件中指定的管理员使用。",
        },
        auth: {
            bind_prompt: "❓ 请输入 9 位 UID 进行绑定，或直接回复本条消息。\n例如：<code>/bind 100000001</code>",
            bind_success: "✅ <b>UID {uid} 绑定成功！</b>\n正在尝试从远程同步数据，请稍候...",
            update_need_bind: "⚠️ 请先绑定 UID 后再使用更新功能。",
            update_syncing: "🔄 正在同步最新数据...",
            update_done: "✅ 数据已完成强制刷新并写入硬盘。",
            update_failed: "❌ 刷新失败，请稍后重试。",
            me_not_bound: "❓ 你还没有绑定 UID，请发送 <code>/bind [你的UID]</code>",
        },
        player: {
            title: "🏠 <b>个人数据中心</b>\n",
            queuing: "⏳ <b>正在排队获取实时数据，请稍后同步...</b>\n",
            fallback: "⚠️ <b>提示: 当前 API 服务繁忙，显示为缓存数据</b>\n",
            info: "👤 玩家: <b>{nickname}</b>\n🆔 UID: <code>{uid}</code>\n📊 等级: Lv.{level}\n\n🏆 成就: {achievement} | 🎭 角色: {avatar}\n请选择功能模块：",
            sync_success: "\n✨ 数据同步已完成",
            sync_failed_hint: "\n❌ 实时同步暂时失败，你可以稍后点击同步按钮重试。",
            sync_failed_all: "❌ 同步失败。当前所有面板服务均无响应，请稍后再试。",
            sync_back_fallback: "\n⚠️ 数据同步失败，已回退至本地缓存。",
            sync_done: "\n✅ 数据已刷新",
        },
        profile: {
            prompt: "❓ 请输入 9 位 UID 或回复包含 UID 的消息。\n用法: <code>/profile 100000001</code>",
            invalid_uid: "❌ <b>输入格式错误</b>\n你输入的 <code>{input}</code> 不是合法的 9 位 UID，请重新输入。",
            showcase_title: "🎭 <b>角色展柜</b> (UID: {uid})\n请选择角色查看详情：",
            search_res: "👤 <b>{nickname}</b> (UID: {uid})\n",
            search_queuing: "⏳ <i>正在排队请求数据，请稍后点击同步按钮</i>\n",
            search_fallback: "⚠️ <i>提示: 接口繁忙，当前显示为缓存数据</i>\n",
            search_footer: "请选择查看详情：",
        },
        char: {
            detail_title: "✨ <b>{name}</b> (Lv.{level} {rank}命)\n◈ 命途: {path} | 属性: {element}\n\n",
            lc_title: "🗡️ <b>{name}</b> (精{rank})\n",
            relic_title: "\n{slot} [{set}]\n├ 主: {main}: {val} | 有效: {v}v\n",
            relic_sub: "{prefix}{name} +{val} {mark} {cont}v\n",
            score_footer: "\n总有效词条: {total}v ({rating})\n\n有效词条权重:\n{weights}",
        },
        gacha: {
            loading: "⏳ 正在解析并合并抽卡记录...",
            import_success: "✅ 记录导入成功！\nUID: <code>{uid}</code> (检测到 {count} 条记录)",
            err_no_data: "未在文件中找到有效的星铁抽卡记录数据。",
            tpl_import_fail: "❌ 导入失败: {error}",
            invalid_url: "❌ <b>输入无效</b>\n\n你发送的内容中没有包含有效的抽卡记录链接。\n链接通常以 <code>https://...</code> 开头，且包含 <code>authkey</code> 等关键特征。",
            help: "\n📊 <b>抽卡记录数据同步</b>\n\n请直接<b>回复本条消息</b>并发送抽卡链接，或直接上传 <code>.json</code> 文件。\n\n💡 只要是有效的 URL，机器人都会尝试进行抓取。\n",
            api_failed: "❌ 同步失败：链接无效、过期或 API 解析异常。请确保你复制的是完整的历史记录链接。",
            none: "该池子暂无数据记录",
            fetching: "[Gacha] 正在抓取{name}池...",
            res_title: "📊 <b>{pool}分析</b> (UID: <code>{uid}</code>)\n运气评价：<b>{luck}</b>\n\n",
            res_stats: "<b>📈 核心数据</b>\n• 抽卡总数: <b>{total}</b> (等价 <b>{cost}</b> 星琼)\n• 已出金卡: <b>{gold}</b> | 歪: <b>{wai}</b>\n• 平均金数: <b>{avg}</b> 抽/金\n• 出紫频率: <b>{p_rate}%</b> ({p_count}张)\n\n",
            res_pity: "<b>⏳ 近期进度</b>\n• 已累积 <b>{pity}</b> 抽未出金\n• 进度: <code>{bar}</code>\n\n",
            res_history: "<b>✨ 历史出金记录</b>\n<pre>{table}</pre>\n",
            res_more: "<i>... 还有 {count} 条记录未显示</i>\n"
        },
        sys: {
            reload_success: "🚀 【指令重载】全量业务逻辑、版本元数据及 UI 配置已完成热更新！",
            reload_action_success: "🚀 【Action重载】全量配置与业务已成功热重载！",
            reload_error: "❌ 重载失败: {error}",
            authkey_error: "链接中未包含 AuthKey",
        },
        key: {
            uid: "UID",
            bind: "绑定",
            gacha_log: "抽卡记录",
            link: "链接",
        }
    }
};
