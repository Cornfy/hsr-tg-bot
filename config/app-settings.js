/**
 * 业务逻辑规则配置 (驱动 Bot 运行的阈值与规则)
 */
module.exports = {
    // --- 跨游戏通用配置 ---
    COMMON: {
        CACHE_EXPIRY: {
            PROFILE: 3600 * 2, // 2小时
            GACHA: 86400      // 24小时
        },
        // 地区映射规则 (按游戏区分)
        REGION_MAP: {
            HSR: {
                '1': 'prod_gf_cn', '2': 'prod_gf_cn', '5': 'prod_qd_cn',
                '6': 'prod_official_usa', '7': 'prod_official_eur',
                '8': 'prod_official_asia', '9': 'prod_official_cht'
            },
            GI: {
                '1': 'prod_gf_cn', '2': 'prod_gf_cn', '5': 'prod_qd_cn',
                '6': 'os_usa', '7': 'os_euro', '8': 'os_asia', '9': 'os_cht'
            },
            ZZZ: {
                '1': 'prod_gf_cn', '15': 'prod_qd_cn'
            }
        },
        // 游戏识别规则
        GAME_DETECTION: {
            BIZ_PREFIXES: {
                hkrpg: 'HSR',
                hk4e: 'GI',
                nap: 'ZZZ'
            },
            DEFAULT_BIZ: {
                HSR: 'hkrpg_cn',
                GI: 'hk4e_cn',
                ZZZ: 'nap_cn'
            },
            FEATURES: {
                HSR: ['light_cone', 'relics', 'characters', 'space_info'],
                GI: ['artifacts', 'avatars', 'equipments'],
                ZZZ: ['engines', 'disks', 'bangboo']
            }
        }
    },

    // --- 崩坏：星穹铁道 (HSR) 专属配置 ---
    HSR: {
        PROFILE_UI: {
            main: ['hp', 'atk', 'def', 'spd', 'crit_rate', 'crit_dmg'],
            other: ['all_dmg', 'break_dmg', 'sp_rate', 'effect_hit', 'effect_res', 'heal_rate'],
            dmg_bonus: ['physical_dmg', 'fire_dmg', 'ice_dmg', 'lightning_dmg', 'wind_dmg', 'quantum_dmg', 'imaginary_dmg'],
            slots: { 1: '头', 2: '手', 3: '躯', 4: '鞋', 5: '球', 6: '绳' }
        },
        CHAR_RULES: {
            trailblazer_prefix: "800",
            trailblazer_ui: { male: "穹", female: "星" },
            multi_path_names: ["三月七"] 
        },
        GACHA_SETTINGS: {
            THRESHOLDS: { LUCKY: 47, NORMAL: 68 },
            UI: {
                BAR_FULL: "█", BAR_EMPTY: "░",
                COLORS: { LUCKY: "🟢", NORMAL: "🟡", BAD: "🔴" },
                LABELS: { NONE: "未出金", LUCKY: "欧皇", NORMAL: "正常", BAD: "非酋" }
            }
        }
    },

    // --- 原神 (GI) 专属配置 (暂不开启业务) ---
    GI: {
        GACHA_SETTINGS: {
            THRESHOLDS: { LUCKY: 55, NORMAL: 75 }
        }
    },

    // --- 绝区零 (ZZZ) 专属配置 (暂不开启业务) ---
    ZZZ: {
        GACHA_SETTINGS: {
            THRESHOLDS: { LUCKY: 45, NORMAL: 65 }
        }
    }
};
