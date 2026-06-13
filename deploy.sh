#!/bin/bash
# CloudBase 部署脚本

echo "========================================"
echo "CloudBase 部署脚本"
echo "========================================"
echo ""

# 检查是否安装了 cloudbase cli
if ! command -v cloudbase &> /dev/null; then
    echo "正在安装 CloudBase CLI..."
    npm install -g @cloudbase/cli
fi

# 检查是否登录
cloudbase login
echo ""

# 部署
echo "开始部署..."
cloudbase framework:deploy

echo ""
echo "部署完成!"
