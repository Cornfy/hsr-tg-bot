/**
 * 游戏核心数据单源 (不随业务逻辑改变的客观事实)
 */
module.exports = {
    // --- 游戏名称映射 ---
    GACHA_GAME_NAMES: {
        HSR: "崩坏：星穹铁道",
        GI: "原神",
        ZZZ: "绝区零"
    },

    // --- 抽卡 API 网关配置 (支持多游戏扩展) ---
    GACHA_API_GATEWAYS: {
        HSR: {
            cn: "https://public-operation-hkrpg.mihoyo.com/common/gacha_record/api",
            global: "https://public-operation-hkrpg-sg.hoyoverse.com/common/gacha_record/api"
        },
        GI: {
            cn: "https://hk4e-api.mihoyo.com/event/gacha_info/api",
            global: "https://hk4e-api-os.hoyoverse.com/event/gacha_info/api"
        },
        ZZZ: {
            cn: "https://public-operation-nap.mihoyo.com/common/gacha_record/api",
            global: "https://public-operation-nap.hoyoverse.com/common/gacha_record/api"
        }
    },

    // --- 崩坏：星穹铁道 (HSR) 数据 ---
    HSR: {
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
            physical_dmg: ["物理伤害加成", "物伤"],
            fire_dmg: ["火属性伤害加成", "火伤"],
            ice_dmg: ["冰属性伤害加成", "冰伤"],
            lightning_dmg: ["雷属性伤害加成", "雷伤"],
            wind_dmg: ["风属性伤害加成", "风伤"],
            quantum_dmg: ["量子伤害加成", "量子"],
            imaginary_dmg: ["虚数伤害加成", "虚数"]
        },
        GACHA_POOLS: {
            "11": "角色活动跃迁（含复刻）",
            "12": "光锥活动跃迁（含复刻）",
            "21": "独立联动角色跃迁",
            "22": "独立联动光锥跃迁",
            "1": "常驻跃迁"
        },
        STANDARD_DATA: {
            chars: [
                "姬子", "瓦尔特", "布洛妮娅", "杰帕德", "克拉拉", "彦卿", "白露",
                "希儿", "符玄", "刃", "银狼", "银枝", "云璃"
            ],
            weapons: ["无可取代的东西", "但战斗还未结束", "以世界之名", "时节不居", "如泥酣眠", "制胜的瞬间", "银河铁道之夜"]
        }
    },

    // --- 原神 (GI) 数据 (留空) ---
    GI: {
        STATS: {},
        GACHA_POOLS: {
            "301": "角色活动祈愿",
            "302": "武器活动祈愿",
            "200": "常驻祈愿"
        }
    },

    // --- 绝区零 (ZZZ) 数据 (留空) ---
    ZZZ: {
        STATS: {},
        GACHA_POOLS: {
            "1": "角色活动频段",
            "2": "音擎活动频段",
            "3": "常驻频段"
        }
    }
};
