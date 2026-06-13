# Facebook 数据导入指南

由于 Facebook 的隐私保护和反爬虫机制，自动爬取需要登录。以下是几种获取 Facebook 动态的方法：

## 方案一：使用 Facebook "下载您的信息" 功能（推荐）

Facebook 官方提供数据导出功能，最安全可靠：

1. 登录 Facebook 网页版
2. 点击右上角头像 → **设置和隐私** → **设置**
3. 左侧菜单选择 **您的 Facebook 信息** → **下载您的信息**
4. 点击 **请求下载副本**
5. 选择：
   - **日期范围**：过去 3 年
   - **格式**：JSON
   - **质量**：高
   - **内容**：勾选"帖子"、"照片和视频"
6. 点击 **创建文件**
7. 等待 Facebook 处理（可能需要几小时到几天）
8. 下载后解压，找到 `posts/your_posts_1.json`

### 转换数据格式

将 Facebook 导出的 JSON 转换为本项目格式：

```javascript
// 转换脚本示例
const fs = require('fs');

const fbData = JSON.parse(fs.readFileSync('your_posts_1.json', 'utf8'));

const posts = fbData.map(post => ({
  id: post.timestamp.toString(),
  content: post.data?.[0]?.post || '',
  created_time: new Date(post.timestamp * 1000).toISOString(),
  reactions: 0, // Facebook 导出不包含互动数据
  comments: 0,
  media: post.attachments?.map(att => {
    if (att.data?.[0]?.media) {
      return {
        type: 'image',
        original_url: att.data[0].media.uri,
        local_path: null,
        cdn_url: null
      };
    }
    return null;
  }).filter(Boolean) || []
}));

fs.writeFileSync('posts.json', JSON.stringify({
  scraped_at: new Date().toISOString(),
  profile_url: 'https://www.facebook.com/david.dai.1213',
  total_posts: posts.length,
  posts
}, null, 2));
```

## 方案二：手动复制粘贴（适合少量帖子）

如果只是少量精选帖子，可以手动创建数据文件：

1. 编辑 `data/posts.json` 文件
2. 按以下格式添加帖子：

```json
{
  "scraped_at": "2026-03-12T00:00:00Z",
  "profile_url": "https://www.facebook.com/david.dai.1213",
  "total_posts": 2,
  "posts": [
    {
      "id": "post_1",
      "content": "你的帖子文字内容",
      "created_time": "2024-01-15T10:30:00Z",
      "reactions": 42,
      "comments": 10,
      "media": [
        {
          "type": "image",
          "original_url": "https://facebook.com/...",
          "local_path": null,
          "cdn_url": null
        }
      ]
    }
  ]
}
```

## 方案三：使用浏览器开发者工具

对于技术用户，可以使用浏览器控制台提取：

1. 登录 Facebook 网页版
2. 访问你的个人主页
3. 按 F12 打开开发者工具 → Console
4. 运行以下脚本：

```javascript
// 在 Facebook 页面控制台运行
const posts = [];
document.querySelectorAll('[role="article"]').forEach(article => {
  const contentEl = article.querySelector('[dir="auto"] span');
  const timeEl = article.querySelector('a[href*="/posts/"]');

  posts.push({
    content: contentEl?.innerText || '',
    url: timeEl?.href || '',
    timestamp: new Date().toISOString()
  });
});

console.log(JSON.stringify(posts, null, 2));
```

5. 复制输出结果，粘贴到 `data/posts.json`

## 方案四：使用第三方工具

一些第三方工具可以帮助导出 Facebook 数据：

- **Chrome 扩展**：Social Book Post Manager（可导出自己的帖子）
- **Python 工具**：facebook-scraper（需要配置 cookies）

---

## 媒体文件处理

获取帖子数据后：

1. **下载图片**：
   ```bash
   npm run download
   ```

2. **上传到七牛云**：
   ```bash
   npm run upload
   ```

3. **刷新网页**查看效果

---

## 当前状态

当前 `data/posts.json` 包含的是示例数据，用于预览布局效果。
你需要按照上述方案之一替换为真实的 Facebook 数据。

需要帮助转换数据格式或有其他问题，请告诉我！
