import { db } from './db.js';

export async function exportData() {
    const books = await db.books.toArray();
    const roles = await db.roles.toArray();
    const records = await db.reading_records.toArray();
    const data = { books, roles, records };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `library_backup_${new Date().toISOString().slice(0,19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export async function importData(file, mode = 'merge') { // mode: 'merge' or 'overwrite'
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.books || !data.roles || !data.records) {
                    reject('无效的备份文件');
                    return;
                }
                if (mode === 'overwrite') {
                    await db.books.clear();
                    await db.roles.clear();
                    await db.reading_records.clear();
                }
                // 导入数据，处理主键冲突
                await db.books.bulkAdd(data.books, { allKeys: true });
                await db.roles.bulkAdd(data.roles, { allKeys: true });
                await db.reading_records.bulkAdd(data.records, { allKeys: true });
                resolve();
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject('读取文件失败');
        reader.readAsText(file);
    });
}