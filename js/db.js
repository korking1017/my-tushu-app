// 直接使用全局 Dexie
export const db = new Dexie('FamilyLibrary');

db.version(2).stores({
    books: '++id, isbn, title, author, status, location, category, isTreasury, buyer, createdAt',
    roles: '++id, name, createdAt',
    reading_records: '++id, bookId, roleId, startDate, finishDate',
    categories: '++id, name, createdAt'
}).upgrade(tx => {
    tx.table('categories').toArray().then(cats => {
        if (cats.length === 0) {
            const defaultCats = ['小说', '科普', '历史', '艺术', '儿童', '工具书', '其他'];
            const now = new Date().toISOString();
            tx.table('categories').bulkAdd(defaultCats.map(name => ({ name, createdAt: now })));
        }
    });
});

db.version(1).stores({
    books: '++id, isbn, title, author, status, location, category, isTreasury, buyer, createdAt',
    roles: '++id, name, createdAt',
    reading_records: '++id, bookId, roleId, startDate, finishDate'
});

export async function initDefaultRoles() {
    const count = await db.roles.count();
    if (count === 0) {
        await db.roles.bulkAdd([
            { name: '爸爸', createdAt: new Date().toISOString() },
            { name: '妈妈', createdAt: new Date().toISOString() },
            { name: '孩子', createdAt: new Date().toISOString() }
        ]);
    }
}

// 图书操作
export async function addBook(book) { return await db.books.add(book); }
export async function updateBook(id, updates) { return await db.books.update(id, updates); }
export async function deleteBook(id) {
    await db.reading_records.where('bookId').equals(id).delete();
    return await db.books.delete(id);
}
export async function getAllBooks() { return await db.books.toArray(); }
export async function getBookById(id) { return await db.books.get(id); }

// 角色操作
export async function addRole(role) { return await db.roles.add(role); }
export async function updateRole(id, updates) { return await db.roles.update(id, updates); }
export async function deleteRole(id) {
    await db.reading_records.where('roleId').equals(id).delete();
    return await db.roles.delete(id);
}
export async function getAllRoles() { return await db.roles.toArray(); }

// 阅读记录操作
export async function addReadingRecord(record) { return await db.reading_records.add(record); }
export async function updateReadingRecord(id, updates) { return await db.reading_records.update(id, updates); }
export async function getReadingRecordsByBook(bookId) { return await db.reading_records.where('bookId').equals(bookId).toArray(); }
export async function getUnfinishedReadingRecord(bookId, roleId) {
    const records = await db.reading_records
        .where('bookId')
        .equals(bookId)
        .filter(rec => rec.roleId === roleId && !rec.finishDate)
        .toArray();
    records.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    return records[0];
}
export async function getCompletedReadingCountByRole(roleId) {
    const records = await db.reading_records.where('roleId').equals(roleId).toArray();
    return records.filter(rec => !!rec.finishDate).length;
}
export async function getAllCompletedRecords() {
    const all = await db.reading_records.toArray();
    return all.filter(rec => !!rec.finishDate);
}

// 类别操作
export async function getAllCategories() { return await db.categories.toArray(); }
export async function addCategory(name) { return await db.categories.add({ name, createdAt: new Date().toISOString() }); }
export async function updateCategory(id, name) { return await db.categories.update(id, { name }); }
export async function deleteCategory(id) { return await db.categories.delete(id); }