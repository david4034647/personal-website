/**
 * Facebook 动态提取脚本 - 在当前页面运行
 * 使用方法：
 * 1. 确保已登录Facebook并在个人主页
 * 2. 按F12打开开发者工具
 * 3. 切换到Console标签
 * 4. 复制粘贴此代码并回车执行
 * 5. 数据会自动下载为JSON文件
 */

(function() {
    'use strict';

    console.log('========================================');
    console.log('Facebook 动态提取工具');
    console.log('========================================\n');

    const posts = [];
    const seenPosts = new Set();

    // 提取单个帖子
    function extractPost(article, index) {
        try {
            // 跳过嵌套的评论
            if (article.parentElement?.closest('[role="article"]')) return null;

            // 提取帖子ID
            let postId = null;
            const postLinks = article.querySelectorAll('a[href*="/posts/"]');
            for (const link of postLinks) {
                const match = link.href.match(/\/posts\/(\d+)/);
                if (match) {
                    postId = match[1];
                    break;
                }
            }

            // 备用：从story_fbid提取
            if (!postId) {
                const storyLinks = article.querySelectorAll('a[href*="story_fbid"]');
                for (const link of storyLinks) {
                    const match = link.href.match(/story_fbid=(\d+)/);
                    if (match) {
                        postId = match[1];
                        break;
                    }
                }
            }

            // 生成唯一ID
            if (!postId) {
                const contentPreview = article.innerText.substring(0, 30).replace(/\W/g, '');
                postId = `post_${index}_${contentPreview}`;
            }

            // 提取文字内容
            let content = '';
            const contentSelectors = [
                '[data-ad-preview="message"]',
                'div[dir="auto"] > div > span',
                'div[dir="auto"] > span',
                '[data-ad-comet-preview="message"]'
            ];

            for (const selector of contentSelectors) {
                const el = article.querySelector(selector);
                if (el && el.innerText) {
                    const text = el.innerText.trim();
                    if (text && text.length > content.length) {
                        content = text;
                    }
                }
            }

            // 备用方法提取内容
            if (!content) {
                const textElements = article.querySelectorAll('div[dir="auto"]');
                for (const el of textElements) {
                    const text = el.innerText?.trim();
                    if (text && text.length > 10 && !text.includes('赞') && !text.includes('评论')) {
                        content = text;
                        break;
                    }
                }
            }

            // 提取时间戳
            let timestamp = null;
            let timestampText = '';

            // 方法1: data-utime
            const timeAbbr = article.querySelector('abbr[data-utime]');
            if (timeAbbr) {
                const utime = timeAbbr.getAttribute('data-utime');
                if (utime) {
                    timestamp = new Date(parseInt(utime) * 1000).toISOString();
                }
            }

            // 方法2: time元素
            if (!timestamp) {
                const timeEl = article.querySelector('time');
                if (timeEl) {
                    const datetime = timeEl.getAttribute('datetime');
                    if (datetime) {
                        timestamp = new Date(datetime).toISOString();
                    }
                }
            }

            // 方法3: aria-label
            if (!timestamp) {
                const links = article.querySelectorAll('a[role="link"]');
                for (const link of links) {
                    const label = link.getAttribute('aria-label');
                    if (label && (/\d+小时|\d+天|\d+年|202\d|201\d/.test(label))) {
                        timestampText = label;
                        break;
                    }
                }
            }

            // 提取地理位置
            let location = '';
            const locationSelectors = [
                'a[href*="/pages/"]',
                'a[href*="/places/"]'
            ];
            for (const selector of locationSelectors) {
                const locEl = article.querySelector(selector);
                if (locEl && locEl.innerText) {
                    const locText = locEl.innerText.trim();
                    if (locText && locText.length < 50 && !locText.includes('http')) {
                        location = locText;
                        break;
                    }
                }
            }

            // 提取媒体
            const media = [];
            const processedUrls = new Set();

            // 图片
            const images = article.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]');
            images.forEach(img => {
                let src = img.src;
                if (!src || processedUrls.has(src)) return;
                if (src.includes('emoji') || src.includes('icon')) return;
                if (img.width < 100 && img.height < 100) return;

                processedUrls.add(src);

                // 获取高清版本
                const highResUrl = src
                    .replace(/\/s\d+x\d+\//, '/')
                    .replace(/\/p\d+x\d+\//, '/')
                    .replace(/_s\d+_x/, '_')
                    .replace(/_n\./, '_o.');

                media.push({
                    type: 'image',
                    original_url: highResUrl,
                    local_path: null,
                    cdn_url: null
                });
            });

            // 视频
            const videos = article.querySelectorAll('video');
            videos.forEach(video => {
                const src = video.src || video.querySelector('source')?.src;
                if (src && !processedUrls.has(src)) {
                    processedUrls.add(src);
                    media.push({
                        type: 'video',
                        original_url: src,
                        local_path: null,
                        cdn_url: null
                    });
                }
            });

            // 只返回有内容或媒体的帖子
            if (content || media.length > 0) {
                return {
                    id: postId,
                    content: content,
                    created_time: timestamp,
                    timestamp_text: timestampText,
                    location: location,
                    media: media
                };
            }
        } catch (e) {
            console.error('提取帖子失败:', e);
        }
        return null;
    }

    // 主函数
    async function main() {
        console.log('开始提取...');
        console.log('提示：提取完成后数据会自动下载\n');

        // 提取所有可见帖子
        const articles = document.querySelectorAll('[role="article"]');
        console.log(`找到 ${articles.length} 个帖子元素`);

        articles.forEach((article, index) => {
            const post = extractPost(article, index);
            if (post) {
                const key = `${post.id}_${post.content?.substring(0, 30)}`;
                if (!seenPosts.has(key)) {
                    seenPosts.add(key);
                    posts.push(post);
                }
            }
        });

        console.log(`成功提取 ${posts.length} 条动态\n`);

        // 生成结果
        const result = {
            scraped_at: new Date().toISOString(),
            profile_url: window.location.href,
            total_posts: posts.length,
            posts: posts
        };

        // 显示统计
        const totalImages = posts.reduce((sum, p) => sum + (p.media?.length || 0), 0);
        console.log('统计:');
        console.log(`- 总动态数: ${posts.length}`);
        console.log(`- 总媒体数: ${totalImages}`);

        // 下载数据
        const dataStr = JSON.stringify(result, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `facebook_posts_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('\n✅ 数据已下载！');
        console.log('请将此文件重命名为 posts.json 并移动到 data/ 目录');

        return result;
    }

    // 运行
    main();
})();
