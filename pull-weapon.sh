#!/bin/bash
set -e

# ANSI 颜色定义
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

REPO_URL="https://github.com/yoimiya-kokomi/miao-plugin.git"
TARGET_DIR="data/meta-sr/weapon"
CACHE_DIR="data/.git_cache"

START_TIME=$SECONDS

echo -e "${CYAN}┌───────────────────────────────────────────┐${NC}"
echo -e "${CYAN}│         🚀 星铁武器元数据同步工具         │${NC}"
echo -e "${CYAN}└───────────────────────────────────────────┘${NC}"

# 1. 检查或更新缓存仓库
if [ -d "$CACHE_DIR/.git" ]; then
    echo -e "${YELLOW}[1/2]${NC} 检测到本地缓存，正在执行增量更新..."
    cd "$CACHE_DIR"
    git pull -q
    cd - > /dev/null
else
    echo -e "${YELLOW}[1/2]${NC} 首次运行，正在建立持久化部分克隆..."
    mkdir -p "$(dirname "$CACHE_DIR")"
    git clone --filter=blob:none --sparse --depth=1 -q "$REPO_URL" "$CACHE_DIR"
    cd "$CACHE_DIR"
    git sparse-checkout set resources/meta-sr/weapon
    cd - > /dev/null
fi

echo -e "${YELLOW}[2/2]${NC} 正在配置相对路径软链接..."
mkdir -p "$(dirname "$TARGET_DIR")"

# 如果目标路径是一个普通目录而非软链接，先安全删除它
if [ -d "$TARGET_DIR" ] && [ ! -L "$TARGET_DIR" ]; then
    rm -rf "$TARGET_DIR"
fi

# 使用相对路径：从 data/meta-sr/ 出发，向上两级回到根目录，再指向缓存
SOURCE_PATH="../../$CACHE_DIR/resources/meta-sr/weapon"
ln -sfn "$SOURCE_PATH" "$TARGET_DIR"

ELAPSED_TIME=$((SECONDS - START_TIME))

echo -e "${GREEN}✨ 软链接配置成功！总耗时: ${ELAPSED_TIME} 秒${NC}"
echo -e "${GREEN}🔗 $TARGET_DIR -> data/.git_cache${NC}"
