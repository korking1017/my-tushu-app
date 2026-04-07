// api.js - 使用 OpenLibrary API（支持 CORS，无需代理）
// 由于其他国内 API 普遍不支持 CORS，OpenLibrary 是唯一可直接调用的免费接口

// 清洗 ISBN
function cleanIsbn(isbn) {
    return isbn ? isbn.replace(/[-\s]/g, '') : '';
}

// 带重试的 fetch 封装
async function fetchWithRetry(url, options, retries = 2, delay = 1000) {
    for (let i = 0; i <= retries; i++) {
        try {
            const controller = new AbortController();
            // 超时设置为 15 秒（国内访问 OpenLibrary 可能较慢）
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response;
        } catch (err) {
            if (i === retries) throw err;
            console.warn(`第 ${i + 1} 次请求失败，${delay}ms 后重试...`, err.message);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// 从 OpenLibrary 获取图书信息
async function fetchFromOpenLibrary(cleanIsbn) {
    const url = `https://openlibrary.org/isbn/${cleanIsbn}.json`;
    const response = await fetchWithRetry(url, {}, 2, 1000);
    const data = await response.json();

    let author = '';
    if (data.authors && data.authors.length > 0) {
        author = data.authors
            .map(a => typeof a === 'string' ? a : (a.name || ''))
            .join(', ');
    }

    return {
        title: data.title || '',
        author: author,
        // 使用 OpenLibrary 官方封面服务，L 代表大图（也可用 M 中号）
        cover: `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`,
        description: data.subtitle || ''
    };
}

// 主函数
export async function fetchBookInfoByIsbn(isbn) {
    const cleanIsbnValue = cleanIsbn(isbn);
    if (!cleanIsbnValue) {
        throw new Error('ISBN 不能为空');
    }

    try {
        console.log(`正在通过 OpenLibrary 查询 ISBN: ${cleanIsbnValue}`);
        const bookInfo = await fetchFromOpenLibrary(cleanIsbnValue);
        // 如果返回的书名为空，则认为未找到
        if (!bookInfo.title) {
            throw new Error('OpenLibrary 未返回有效书名');
        }
        return bookInfo;
    } catch (err) {
        console.error(`OpenLibrary 查询失败: ${err.message}`);
        throw new Error('未找到图书信息，请手动填写');
    }
}