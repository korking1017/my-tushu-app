export async function fetchBookInfoByIsbn(isbn) {
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            const book = data.items[0].volumeInfo;
            return {
                title: book.title || '',
                author: book.authors ? book.authors.join(', ') : '',
                cover: book.imageLinks ? book.imageLinks.thumbnail : '',
                description: book.description || ''
            };
        } else {
            throw new Error('未找到图书信息');
        }
    } catch (error) {
        console.error('API错误:', error);
        throw error;
    }
}