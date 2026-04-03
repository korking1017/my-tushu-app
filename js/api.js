// api.js - 图书信息获取模块，支持 Google Books API 和 OpenLibrary 备用
export async function fetchBookInfoByIsbn(isbn) {
    // 清洗 ISBN：移除连字符和空格，保留数字和末尾可能的 X
    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    if (!cleanIsbn) {
        throw new Error('ISBN 不能为空');
    }

    // 尝试 Google Books API（优先，数据较全）
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒超时
        const response = await fetch(
            `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`,
            { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            if (data.items && data.items.length > 0) {
                const book = data.items[0].volumeInfo;
                return {
                    title: book.title || '',
                    author: book.authors ? book.authors.join(', ') : '',
                    cover: book.imageLinks ? book.imageLinks.thumbnail : '',
                    description: book.description || ''
                };
            }
        }
        // Google 无结果，继续尝试备用 API
        console.warn(`Google Books 未找到 ISBN ${cleanIsbn}，尝试 OpenLibrary`);
    } catch (err) {
        console.warn(`Google Books 请求失败: ${err.message}，尝试备用 API`);
    }

    // 备用：OpenLibrary API（无需密钥，国内访问相对稳定）
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(
            `https://openlibrary.org/isbn/${cleanIsbn}.json`,
            { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            // OpenLibrary 返回的数据结构：title, authors (数组对象), subtitle 等
            let author = '';
            if (data.authors && data.authors.length > 0) {
                // 注意：OpenLibrary 的 authors 字段可能直接是名字字符串，也可能是对象 { name: ... }
                author = data.authors.map(a => typeof a === 'string' ? a : a.name).join(', ');
            }
            return {
                title: data.title || '',
                author: author,
                cover: `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`, // M 中号封面
                description: data.subtitle || ''
            };
        } else {
            throw new Error(`OpenLibrary 响应错误: ${response.status}`);
        }
    } catch (err) {
        console.error(`OpenLibrary 请求失败: ${err.message}`);
        throw new Error('未找到图书信息，请手动填写');
    }
}