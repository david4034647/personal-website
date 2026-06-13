/**
 * Facebook 帖子提取脚本
 * 在 Facebook 个人主页控制台运行此脚本
 */

(function() {
    'use strict';

    const posts = [];
    let processedCount = 0;

    // 滚动页面加载更多帖子
    async function scrollPage() {
        const scrollHeight = document.body.scrollHeight;
        window.scrollTo(0, scrollHeight);
        await new Promise(r => setTimeout(r, 2000));
        return document.body.scrollHeight > scrollHeight;
    }

    // 提取单个帖子数据
    function extractPost(article) {
        try {
            // 提取帖子内容
            const contentEl = article.querySelector('[data-ad-preview="message"] span, [dir="auto"] > span, .userContent');
            const content = contentEl ? contentEl.innerText.trim() : '';

            // 提取时间戳
            const timeEl = article.querySelector('a[href*="/posts/"] abbr, time, [role="link"] abbr');
            let timestamp = null;
            if (timeEl) {
                const dataTime = timeEl.getAttribute('data-utime') || timeEl.getAttribute('data-timestamp');
                if (dataTime) {
                    timestamp = new Date(parseInt(dataTime) * 1000).toISOString();
                } else {
                    const title = timeEl.getAttribute('title');
                    if (title) {
                        timestamp = new Date(title).toISOString();
                    }
                }
            }

            // 提取媒体文件
            const media = [];

            // 图片
            const images = article.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]');
            images.forEach(img => {
                const src = img.src;
                if (src && !src.includes('emoji') && !src.includes('icon')) {
                    // 尝试获取高清版本
                    const highResUrl = src.replace(/\/s\d+x\d+\//, '/').replace(/\/p\d+x\d+\//, '/');
                    media.push({
                        type: 'image',
                        original_url: highResUrl,
                        local_path: null,
                        cdn_url: null
                    });
                }
            });

            // 视频
            const videos = article.querySelectorAll('video');
            videos.forEach(video => {
                const src = video.src || video.querySelector('source')?.src;
                if (src) {
                    media.push({
                        type: 'video',
                        original_url: src,
                        local_path: null,
                        cdn_url: null
                    });
                }
            });

            // 去重
            const uniqueMedia = [];
            const seen = new Set();
            media.forEach(m => {
                if (!seen.has(m.original_url)) {
                    seen.add(m.original_url);
                    uniqueMedia.push(m);
                }
            });

            // 只返回有内容的帖子
            if (content || uniqueMedia.length > 0) {
                return {
                    id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    content: content,
                    created_time: timestamp || new Date().toISOString(),
                    reactions: 0,
                    comments: 0,
                    media: uniqueMedia
                };
            }
        } catch (e) {
            console.error('提取帖子失败:', e);
        }
        return null;
    }

    // 提取所有可见帖子
    function extractAllPosts() {
        const articles = document.querySelectorAll('[role="article"]');
        console.log(`找到 ${articles.length} 个帖子元素`);

        articles.forEach(article => {
            const post = extractPost(article);
            if (post) {
                // 检查是否已存在
                const exists = posts.some(p =>
                    p.content === post.content &&
                    p.created_time === post.created_time
                );
                if (!exists) {
                    posts.push(post);
                    processedCount++;
                }
            }
        });
    }

    // 主函数
    async function main() {
        console.log('开始提取 Facebook 帖子...');
        console.log('请等待页面滚动加载更多帖子...');

        let scrollCount = 0;
        const maxScrolls = 50; // 最多滚动次数

        while (scrollCount < maxScrolls) {
            extractAllPosts();
            console.log(`已提取 ${posts.length} 个帖子，继续滚动...`);

            const hasMore = await scrollPage();
            scrollCount++;

            if (!hasMore && scrollCount > 5) {
                console.log('页面已滚动到底部');
                break;
            }

            // 每10次滚动询问是否继续
            if (scrollCount % 10 === 0) {
                console.log(`已滚动 ${scrollCount} 次，提取了 ${posts.length} 个帖子`);
                console.log('如需停止，请刷新页面');
            }
        }

        // 生成结果
        const result = {
            scraped_at: new Date().toISOString(),
            profile_url: window.location.href,
            total_posts: posts.length,
            posts: posts
        };

        // 输出到控制台
        console.log('\n========== 提取完成 ==========');
        console.log(`共提取 ${posts.length} 个帖子`);
        console.log('\n请复制以下数据到 data/posts.json 文件：\n');
        console.log(JSON.stringify(result, null, 2));

        // 创建下载链接
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

        console.log('\n✅ 数据已自动下载到本地文件');
        console.log('请将下载的文件重命名为 posts.json 并移动到 data/ 目录');

        return result;
    }

    // 运行
    main();
})();
