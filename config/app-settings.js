// config/app-settings.js

/**
 * 业务逻辑规则配置 (驱动 Bot 运行的阈值与规则)
 */
module.exports = {
    // --- 抽卡评价规则 ---
    GACHA_SETTINGS: {
        THRESHOLDS: {
            LUCKY: 47,
            NORMAL: 68
        },
        UI: {
            BAR_FULL: "█",
            BAR_EMPTY: "░",
            COLORS: {
                LUCKY: "🟢",
                NORMAL: "🟡",
                BAD: "🔴"
            },
            LABELS: {
                NONE: "未出金",
                LUCKY: "欧皇",
                NORMAL: "正常",
                BAD: "非酋"
            }
        }
    },

    // --- 角色匹配规则 (热重载支持) ---
    CHAR_RULES: {
        // 开拓者（主角）的底层 ID 共同特征（前缀）
        trailblazer_prefix: "800",

        // 主角在 UI 上的名字映射（奇数 ID 对应男主穹，偶数 ID 对应女主星）
        trailblazer_ui: { male: "穹", female: "星" },

        // 需要追加 “•命途” 后缀以防权重混淆的多命途常规角色名单
        multi_path_names: ["三月七"] 
    },

    // --- 缓存规则 ---
    CACHE_EXPIRY: {
        PROFILE: 3600 * 2, // 2小时
        GACHA: 86400      // 24小时
    },

    // --- 面板 UI 展现规则 (槽位映射与属性分组) ---
    PROFILE_UI: {
        main: ['hp', 'atk', 'def', 'spd', 'crit_rate', 'crit_dmg'],
        other: ['all_dmg', 'break_dmg', 'sp_rate', 'effect_hit', 'effect_res', 'heal_rate'],
        dmg_bonus: ['physical_dmg', 'fire_dmg', 'ice_dmg', 'lightning_dmg', 'wind_dmg', 'quantum_dmg', 'imaginary_dmg'],
        slots: { 1: '头', 2: '手', 3: '躯', 4: '鞋', 5: '球', 6: '绳' }
    }
};
