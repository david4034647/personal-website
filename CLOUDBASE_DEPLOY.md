# CloudBase 部署指南

## 前置要求

1. 腾讯云账号
2. 已开通 CloudBase（云开发）服务

## 部署步骤

### 1. 安装 CloudBase CLI

```bash
npm install -g @cloudbase/cli
```

### 2. 登录 CloudBase

```bash
cloudbase login
```

### 3. 创建云开发环境（如未创建）

```bash
cloudbase env:create
```

记下创建的环境 ID（envId），格式如 `personal-website-xxx`。

### 4. 修改配置文件

编辑 `cloudbaserc.json`，将 `{{envId}}` 替换为你的实际环境 ID：

```json
{
  "version": "2.0",
  "envId": "your-env-id-here",
  ...
}
```

### 5. 部署

```bash
# 方式1：使用脚本
chmod +x deploy.sh
./deploy.sh

# 方式2：直接使用 cloudbase 命令
cloudbase framework:deploy
```

### 6. 查看部署结果

部署完成后，控制台会显示访问地址，格式如：
`https://your-env-id-xxx.tcloudbaseapp.com`

## 自定义域名（可选）

1. 登录 [CloudBase 控制台](https://console.cloud.tencent.com/tcb)
2. 选择你的环境
3. 进入 "静态网站托管"
4. 点击 "域名管理" 添加自定义域名

## 文件说明

- `index.html` - 主页面
- `data/posts.json` - Facebook 动态数据
- `media/` - 本地媒体文件
- `cloudbaserc.json` - CloudBase 部署配置

## 注意事项

1. 首次部署需要登录腾讯云账号
2. 确保 `data/posts.json` 和 `media/` 目录存在且包含数据
3. 网站为静态页面，所有数据已包含在项目中

## 重新部署

更新数据后，重新运行：

```bash
cloudbase framework:deploy
```
