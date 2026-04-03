import { db, initDefaultRoles, addBook, updateBook, deleteBook, getAllBooks, getBookById, getAllRoles, addReadingRecord, updateReadingRecord, getUnfinishedReadingRecord, getReadingRecordsByBook, getCompletedReadingCountByRole, getAllCompletedRecords } from './db.js';
import { fetchBookInfoByIsbn } from './api.js';
import { startScanner } from './scanner.js';
import { exportData, importData } from './backup.js';
import { renderBookList, setViewMode } from './views.js';

// DOM 元素
const appContainer = document.getElementById('app');
const navBooks = document.getElementById('nav-books');
const navAdd = document.getElementById('nav-add');
const navStats = document.getElementById('nav-stats');
const navSettings = document.getElementById('nav-settings');
const modalContainer = document.getElementById('modal-container');
const modalContent = document.getElementById('modal-content');

let currentFilter = {
    keyword: '',
    status: '',
    category: '',
    treasury: false
};

// 初始化
async function init() {
    await initDefaultRoles();
    await showBooksView();
    setupNavigation();
}

// 显示图书列表（带搜索和筛选）
async function showBooksView() {
    let books = await getAllBooks();
    books = applyFilter(books);
    
    const categories = [...new Set(books.map(b => b.category).filter(c => c))];
    const filterHtml = `
        <div class="mb-4 space-y-2">
            <div class="relative">
                <i class="fas fa-search absolute left-3 top-3 text-gray-400"></i>
                <input type="text" id="search-input" placeholder="搜索书名或作者" class="w-full pl-10 pr-4 py-2 border rounded-lg">
            </div>
            <div class="flex flex-wrap gap-2">
                <select id="filter-status" class="border rounded px-2 py-1 text-sm">
                    <option value="">全部状态</option>
                    <option value="unread">未读</option>
                    <option value="reading">正在阅读</option>
                    <option value="read">已读完</option>
                </select>
                <select id="filter-category" class="border rounded px-2 py-1 text-sm">
                    <option value="">全部分类</option>
                    ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
                <label class="flex items-center space-x-1 text-sm">
                    <input type="checkbox" id="filter-treasury"> <span>尊贤堂藏书</span>
                </label>
                <button id="clear-filter" class="text-red-500 text-sm px-2">清除筛选</button>
            </div>
        </div>
        <div id="book-list-container"></div>
    `;
    appContainer.innerHTML = filterHtml;
    const listContainer = document.getElementById('book-list-container');
    
    const render = () => {
        renderBookList(listContainer, books, 
            (id) => showEditBookForm(id),
            async (id) => {
                if (confirm('确定删除这本书吗？')) {
                    await deleteBook(id);
                    await showBooksView();
                }
            },
            (id) => showStartReadingDialog(id),
            (id) => completeReading(id),
            (id) => showRereadDialog(id)
        );
        window.showBookDetail = showBookDetail;
    };
    render();
    
    // 绑定筛选事件
    const searchInput = document.getElementById('search-input');
    const filterStatus = document.getElementById('filter-status');
    const filterCategory = document.getElementById('filter-category');
    const filterTreasury = document.getElementById('filter-treasury');
    const clearBtn = document.getElementById('clear-filter');
    
    const refreshFilter = async () => {
        currentFilter.keyword = searchInput.value.toLowerCase();
        currentFilter.status = filterStatus.value;
        currentFilter.category = filterCategory.value;
        currentFilter.treasury = filterTreasury.checked;
        books = applyFilter(await getAllBooks());
        render();
    };
    
    searchInput.addEventListener('input', refreshFilter);
    filterStatus.addEventListener('change', refreshFilter);
    filterCategory.addEventListener('change', refreshFilter);
    filterTreasury.addEventListener('change', refreshFilter);
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        filterStatus.value = '';
        filterCategory.value = '';
        filterTreasury.checked = false;
        refreshFilter();
    });
}

function applyFilter(books) {
    return books.filter(book => {
        if (currentFilter.keyword) {
            const kw = currentFilter.keyword;
            if (!(book.title.toLowerCase().includes(kw) || (book.author && book.author.toLowerCase().includes(kw)))) {
                return false;
            }
        }
        if (currentFilter.status && book.status !== currentFilter.status) return false;
        if (currentFilter.category && book.category !== currentFilter.category) return false;
        if (currentFilter.treasury && !book.isTreasury) return false;
        return true;
    });
}

// 显示图书详情
async function showBookDetail(bookId) {
    const book = await getBookById(bookId);
    if (!book) return;
    const records = await getReadingRecordsByBook(bookId);
    const roles = await getAllRoles();
    const roleMap = new Map(roles.map(r => [r.id, r.name]));
    
    let historyHtml = '';
    if (records.length) {
        historyHtml = '<div class="mt-4"><h3 class="font-bold">阅读记录</h3><ul class="list-disc pl-5">';
        records.forEach(rec => {
            const roleName = roleMap.get(rec.roleId) || '未知';
            const start = rec.startDate ? new Date(rec.startDate).toLocaleDateString() : '未知';
            const finish = rec.finishDate ? new Date(rec.finishDate).toLocaleDateString() : '进行中';
            historyHtml += `<li>${roleName}: ${start} → ${finish}</li>`;
        });
        historyHtml += '</ul></div>';
    } else {
        historyHtml = '<div class="mt-4 text-gray-500">暂无阅读记录</div>';
    }

    let actionButtons = '';
    if (book.status === 'unread') {
        actionButtons = `<button id="detail-start" class="bg-blue-500 text-white px-4 py-2 rounded mt-2 w-full">开始阅读</button>`;
    } else if (book.status === 'reading') {
        actionButtons = `<button id="detail-complete" class="bg-green-500 text-white px-4 py-2 rounded mt-2 w-full">完成阅读</button>`;
    } else {
        actionButtons = `<button id="detail-reread" class="bg-yellow-500 text-white px-4 py-2 rounded mt-2 w-full">重读</button>`;
    }

    modalContent.innerHTML = `
        <div class="max-h-96 overflow-y-auto">
            <h2 class="text-xl font-bold mb-2">${escapeHtml(book.title)}</h2>
            <p class="text-gray-600">作者：${escapeHtml(book.author)}</p>
            <p class="text-gray-600">类别：${escapeHtml(book.category) || '未分类'} ${book.isTreasury ? '🏷️ 尊贤堂藏书' : ''}</p>
            <p class="text-gray-600">位置：${escapeHtml(book.location) || '未设置'}</p>
            <p class="text-gray-600">购买人：${escapeHtml(book.buyer) || '未知'}</p>
            <p class="text-gray-600">状态：${getStatusText(book.status)}</p>
            <p class="text-gray-600">备注：${escapeHtml(book.notes) || '无'}</p>
            ${historyHtml}
            ${actionButtons}
        </div>
    `;
    modalContainer.classList.remove('hidden');

    if (book.status === 'unread') {
        document.getElementById('detail-start')?.addEventListener('click', async () => {
            modalContainer.classList.add('hidden');
            await showStartReadingDialog(book.id);
        });
    } else if (book.status === 'reading') {
        document.getElementById('detail-complete')?.addEventListener('click', async () => {
            modalContainer.classList.add('hidden');
            await completeReading(book.id);
        });
    } else {
        document.getElementById('detail-reread')?.addEventListener('click', async () => {
            modalContainer.classList.add('hidden');
            await showRereadDialog(book.id);
        });
    }
}

// 开始阅读对话框
async function showStartReadingDialog(bookId) {
    const roles = await getAllRoles();
    if (roles.length === 0) {
        alert('请先添加家庭成员角色');
        return;
    }
    const roleOptions = roles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    modalContent.innerHTML = `
        <h3 class="text-lg font-bold mb-2">选择阅读人</h3>
        <select id="reading-role" class="w-full border rounded p-2 mb-4">${roleOptions}</select>
        <div class="flex justify-end">
            <button id="cancel-start" class="mr-2 px-4 py-2 bg-gray-300 rounded">取消</button>
            <button id="confirm-start" class="px-4 py-2 bg-blue-500 text-white rounded">确认</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    document.getElementById('cancel-start').onclick = () => modalContainer.classList.add('hidden');
    document.getElementById('confirm-start').onclick = async () => {
        const roleId = parseInt(document.getElementById('reading-role').value);
        await updateBook(bookId, { status: 'reading' });
        await addReadingRecord({
            bookId,
            roleId,
            startDate: new Date().toISOString(),
            finishDate: null
        });
        modalContainer.classList.add('hidden');
        await showBooksView();
    };
}

// 完成阅读
async function completeReading(bookId) {
    const book = await getBookById(bookId);
    if (!book) return;
    const roles = await getAllRoles();
    let unfinishedRecords = [];
    for (const role of roles) {
        const rec = await getUnfinishedReadingRecord(bookId, role.id);
        if (rec) unfinishedRecords.push(rec);
    }
    if (unfinishedRecords.length === 0) {
        alert('没有找到未完成的阅读记录，请先开始阅读');
        return;
    }
    if (unfinishedRecords.length > 1) {
        const options = unfinishedRecords.map(rec => {
            const roleName = roles.find(r => r.id === rec.roleId)?.name || '未知';
            return `<option value="${rec.id}">${roleName} (开始于 ${new Date(rec.startDate).toLocaleDateString()})</option>`;
        }).join('');
        modalContent.innerHTML = `
            <h3 class="text-lg font-bold mb-2">选择要完成的阅读记录</h3>
            <select id="complete-record" class="w-full border rounded p-2 mb-4">${options}</select>
            <div class="flex justify-end">
                <button id="cancel-complete" class="mr-2 px-4 py-2 bg-gray-300 rounded">取消</button>
                <button id="confirm-complete" class="px-4 py-2 bg-green-500 text-white rounded">确认</button>
            </div>
        `;
        modalContainer.classList.remove('hidden');
        document.getElementById('cancel-complete').onclick = () => modalContainer.classList.add('hidden');
        document.getElementById('confirm-complete').onclick = async () => {
            const recordId = parseInt(document.getElementById('complete-record').value);
            await updateReadingRecord(recordId, { finishDate: new Date().toISOString() });
            await updateBook(bookId, { status: 'read' });
            modalContainer.classList.add('hidden');
            await showBooksView();
        };
        return;
    } else {
        await updateReadingRecord(unfinishedRecords[0].id, { finishDate: new Date().toISOString() });
        await updateBook(bookId, { status: 'read' });
        await showBooksView();
    }
}

// 重读对话框
async function showRereadDialog(bookId) {
    const roles = await getAllRoles();
    if (roles.length === 0) {
        alert('请先添加家庭成员角色');
        return;
    }
    const roleOptions = roles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    modalContent.innerHTML = `
        <h3 class="text-lg font-bold mb-2">选择重读人</h3>
        <select id="reread-role" class="w-full border rounded p-2 mb-4">${roleOptions}</select>
        <div class="flex justify-end">
            <button id="cancel-reread" class="mr-2 px-4 py-2 bg-gray-300 rounded">取消</button>
            <button id="confirm-reread" class="px-4 py-2 bg-yellow-500 text-white rounded">确认</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    document.getElementById('cancel-reread').onclick = () => modalContainer.classList.add('hidden');
    document.getElementById('confirm-reread').onclick = async () => {
        const roleId = parseInt(document.getElementById('reread-role').value);
        await updateBook(bookId, { status: 'reading' });
        await addReadingRecord({
            bookId,
            roleId,
            startDate: new Date().toISOString(),
            finishDate: null
        });
        modalContainer.classList.add('hidden');
        await showBooksView();
    };
}

// 添加/编辑图书表单（包含手动获取信息按钮）
async function showAddBookForm(book = null) {
    const isEdit = !!book;
    const formHtml = `
        <form id="book-form" class="space-y-3">
            <div>
                <label class="block text-sm font-medium">ISBN</label>
                <div class="flex">
                    <input type="text" id="isbn" value="${escapeHtml(book?.isbn || '')}" class="flex-1 border rounded-l p-2" placeholder="扫描或手动输入">
                    <button type="button" id="scan-btn" class="bg-blue-500 text-white px-3 rounded-r">扫码</button>
                </div>
                <div class="mt-1">
                    <button type="button" id="fetch-info-btn" class="text-sm text-blue-500">📖 根据ISBN获取图书信息</button>
                </div>
            </div>
            <div>
                <label class="block text-sm font-medium">书名 *</label>
                <input type="text" id="title" required value="${escapeHtml(book?.title || '')}" class="w-full border rounded p-2">
            </div>
            <div>
                <label class="block text-sm font-medium">作者</label>
                <input type="text" id="author" value="${escapeHtml(book?.author || '')}" class="w-full border rounded p-2">
            </div>
            <div>
                <label class="block text-sm font-medium">封面图片URL</label>
                <input type="text" id="cover" value="${escapeHtml(book?.cover || '')}" class="w-full border rounded p-2" placeholder="可选，输入图片地址">
            </div>
            <div>
                <label class="block text-sm font-medium">类别</label>
                <input list="categories" id="category" value="${escapeHtml(book?.category || '')}" class="w-full border rounded p-2">
                <datalist id="categories">
                    <option>小说</option><option>科普</option><option>历史</option><option>艺术</option><option>儿童</option><option>工具书</option><option>其他</option>
                </datalist>
            </div>
            <div>
                <label class="inline-flex items-center">
                    <input type="checkbox" id="isTreasury" ${book?.isTreasury ? 'checked' : ''} class="mr-2"> 尊贤堂藏书
                </label>
            </div>
            <div>
                <label class="block text-sm font-medium">存放位置</label>
                <input type="text" id="location" value="${escapeHtml(book?.location || '')}" class="w-full border rounded p-2">
            </div>
            <div>
                <label class="block text-sm font-medium">购买人</label>
                <input type="text" id="buyer" value="${escapeHtml(book?.buyer || '')}" class="w-full border rounded p-2">
            </div>
            <div>
                <label class="block text-sm font-medium">备注</label>
                <textarea id="notes" class="w-full border rounded p-2">${escapeHtml(book?.notes || '')}</textarea>
            </div>
            <div class="flex justify-end">
                <button type="button" id="cancel-form" class="mr-2 px-4 py-2 bg-gray-300 rounded">取消</button>
                <button type="submit" class="px-4 py-2 bg-blue-500 text-white rounded">保存</button>
            </div>
        </form>
    `;
    modalContent.innerHTML = formHtml;
    modalContainer.classList.remove('hidden');

    const form = document.getElementById('book-form');
    const scanBtn = document.getElementById('scan-btn');
    const fetchInfoBtn = document.getElementById('fetch-info-btn');
    const isbnInput = document.getElementById('isbn');
    const titleInput = document.getElementById('title');
    const authorInput = document.getElementById('author');
    const coverInput = document.getElementById('cover');

    // 扫码功能
    scanBtn?.addEventListener('click', async () => {
        modalContainer.classList.add('hidden');
        await startScanner(async (isbn) => {
            console.log('扫码获取的ISBN:', isbn);
            try {
                const info = await fetchBookInfoByIsbn(isbn);
                isbnInput.value = isbn;
                titleInput.value = info.title;
                authorInput.value = info.author;
                coverInput.value = info.cover;
                modalContainer.classList.remove('hidden');
            } catch (err) {
                alert('获取图书信息失败，请手动填写');
                modalContainer.classList.remove('hidden');
            }
        }, (err) => {
            console.error('扫码错误:', err);
            alert(err);
            modalContainer.classList.remove('hidden');
        });
    });

    // 手动输入ISBN后获取信息
    fetchInfoBtn?.addEventListener('click', async () => {
        const isbn = isbnInput.value.trim();
        if (!isbn) {
            alert('请输入ISBN号');
            return;
        }
        try {
            const info = await fetchBookInfoByIsbn(isbn);
            titleInput.value = info.title;
            authorInput.value = info.author;
            coverInput.value = info.cover;
            alert('已自动填充书名、作者和封面');
        } catch (err) {
            alert('未找到图书信息，请手动填写');
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bookData = {
            isbn: isbnInput.value,
            title: titleInput.value,
            author: authorInput.value,
            cover: coverInput.value,
            category: document.getElementById('category').value,
            isTreasury: document.getElementById('isTreasury').checked,
            location: document.getElementById('location').value,
            buyer: document.getElementById('buyer').value,
            notes: document.getElementById('notes').value,
            status: book?.status || 'unread',
            createdAt: book?.createdAt || new Date().toISOString()
        };
        if (!bookData.title) {
            alert('书名不能为空');
            return;
        }
        if (isEdit) {
            await updateBook(book.id, bookData);
        } else {
            await addBook(bookData);
        }
        modalContainer.classList.add('hidden');
        await showBooksView();
    });

    document.getElementById('cancel-form').addEventListener('click', () => {
        modalContainer.classList.add('hidden');
    });
}

async function showEditBookForm(id) {
    const book = await getBookById(id);
    if (book) showAddBookForm(book);
}

// 角色管理视图
async function showRolesView() {
    const roles = await getAllRoles();
    let rolesHtml = '';
    for (const role of roles) {
        const completedCount = await getCompletedReadingCountByRole(role.id);
        rolesHtml += `
            <div class="bg-white p-3 rounded shadow flex justify-between items-center mb-2">
                <div>
                    <span class="font-bold">${escapeHtml(role.name)}</span>
                    <span class="text-sm text-gray-500 ml-2">已读 ${completedCount} 本书</span>
                </div>
                <div>
                    <button class="edit-role text-blue-500 mr-2" data-id="${role.id}"><i class="fas fa-edit"></i></button>
                    <button class="delete-role text-red-500" data-id="${role.id}"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }
    appContainer.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold">家庭成员</h2>
            <button id="add-role-btn" class="bg-blue-500 text-white px-3 py-1 rounded"><i class="fas fa-plus"></i> 添加角色</button>
        </div>
        <div id="roles-list">${rolesHtml || '<p class="text-gray-500">暂无角色，点击添加</p>'}</div>
        <button id="back-to-settings" class="mt-4 bg-gray-500 text-white px-4 py-2 rounded w-full">返回设置</button>
    `;
    document.getElementById('add-role-btn')?.addEventListener('click', () => showAddRoleForm());
    document.getElementById('back-to-settings')?.addEventListener('click', () => showSettingsView());
    document.querySelectorAll('.edit-role').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(btn.dataset.id);
            showEditRoleForm(id);
        });
    });
    document.querySelectorAll('.delete-role').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(btn.dataset.id);
            if (confirm('删除角色会同时删除其所有阅读记录，确定吗？')) {
                await db.roles.delete(id);
                await db.reading_records.where('roleId').equals(id).delete();
                await showRolesView();
            }
        });
    });
}

async function showAddRoleForm(role = null) {
    const isEdit = !!role;
    modalContent.innerHTML = `
        <form id="role-form">
            <label class="block text-sm font-medium">角色名称</label>
            <input type="text" id="role-name" value="${escapeHtml(role?.name || '')}" class="w-full border rounded p-2 mb-4" required>
            <div class="flex justify-end">
                <button type="button" id="cancel-role" class="mr-2 px-4 py-2 bg-gray-300 rounded">取消</button>
                <button type="submit" class="px-4 py-2 bg-blue-500 text-white rounded">保存</button>
            </div>
        </form>
    `;
    modalContainer.classList.remove('hidden');
    const form = document.getElementById('role-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('role-name').value.trim();
        if (!name) return;
        if (isEdit) {
            await db.roles.update(role.id, { name });
        } else {
            await db.roles.add({ name, createdAt: new Date().toISOString() });
        }
        modalContainer.classList.add('hidden');
        await showRolesView();
    });
    document.getElementById('cancel-role').onclick = () => modalContainer.classList.add('hidden');
}

async function showEditRoleForm(id) {
    const role = await db.roles.get(id);
    if (role) showAddRoleForm(role);
}

// 统计视图（带错误处理）
async function showStatsView() {
    try {
        const books = await getAllBooks();
        const totalBooks = books.length;
        const treasuryCount = books.filter(b => b.isTreasury).length;
        const completedRecords = await getAllCompletedRecords();
        const uniqueReadBooks = new Set(completedRecords.map(r => r.bookId)).size;
        const roles = await getAllRoles();
        const roleStats = [];
        for (const role of roles) {
            const count = await getCompletedReadingCountByRole(role.id);
            roleStats.push({ name: role.name, count });
        }
        roleStats.sort((a,b) => b.count - a.count);
        const categoryMap = new Map();
        books.forEach(book => {
            const cat = book.category || '未分类';
            categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
        });
        const categories = Array.from(categoryMap.keys());
        const categoryCounts = Array.from(categoryMap.values());

        appContainer.innerHTML = `
            <h2 class="text-xl font-bold mb-4">统计</h2>
            <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="bg-white p-3 rounded shadow text-center"><div class="text-2xl font-bold">${totalBooks}</div><div>总藏书</div></div>
                <div class="bg-white p-3 rounded shadow text-center"><div class="text-2xl font-bold">${uniqueReadBooks}</div><div>已读图书</div></div>
                <div class="bg-white p-3 rounded shadow text-center"><div class="text-2xl font-bold">${treasuryCount}</div><div>尊贤堂藏书</div></div>
            </div>
            <div class="bg-white p-3 rounded shadow mb-4">
                <h3 class="font-bold mb-2">类别分布</h3>
                <canvas id="categoryChart" width="400" height="200"></canvas>
            </div>
            <div class="bg-white p-3 rounded shadow">
                <h3 class="font-bold mb-2">角色阅读排行</h3>
                <canvas id="roleChart" width="400" height="200"></canvas>
            </div>
        `;

        setTimeout(() => {
            const catCanvas = document.getElementById('categoryChart');
            const roleCanvas = document.getElementById('roleChart');
            if (catCanvas && roleCanvas) {
                new Chart(catCanvas.getContext('2d'), {
                    type: 'bar',
                    data: { labels: categories, datasets: [{ label: '数量', data: categoryCounts, backgroundColor: '#3b82f6' }] }
                });
                new Chart(roleCanvas.getContext('2d'), {
                    type: 'bar',
                    data: { labels: roleStats.map(r => r.name), datasets: [{ label: '已读数量', data: roleStats.map(r => r.count), backgroundColor: '#10b981' }] }
                });
            } else {
                console.warn('图表 canvas 未找到');
            }
        }, 100);
    } catch (err) {
        console.error('统计页面加载失败', err);
        appContainer.innerHTML = '<div class="text-red-500 p-4">统计页面加载失败，请刷新重试</div>';
    }
}

// 设置视图
async function showSettingsView() {
    appContainer.innerHTML = `
        <h2 class="text-xl font-bold mb-4">设置</h2>
        <div class="space-y-3">
            <div class="bg-white p-3 rounded shadow">
                <div class="flex justify-between items-center">
                    <div>
                        <h3 class="font-bold">家庭成员管理</h3>
                        <p class="text-sm text-gray-500">添加、编辑或删除阅读角色</p>
                    </div>
                    <button id="go-roles-btn" class="bg-blue-500 text-white px-3 py-1 rounded">管理</button>
                </div>
            </div>
            <div class="bg-white p-3 rounded shadow">
                <h3 class="font-bold mb-2">视图偏好</h3>
                <div class="flex space-x-2">
                    <button id="set-card-view" class="px-3 py-1 rounded ${localStorage.getItem('viewMode') !== 'list' ? 'bg-blue-500 text-white' : 'bg-gray-200'}">卡片视图</button>
                    <button id="set-list-view" class="px-3 py-1 rounded ${localStorage.getItem('viewMode') === 'list' ? 'bg-blue-500 text-white' : 'bg-gray-200'}">列表视图</button>
                </div>
            </div>
            <div class="bg-white p-3 rounded shadow">
                <h3 class="font-bold mb-2">数据管理</h3>
                <button id="export-btn" class="bg-green-500 text-white px-3 py-1 rounded mr-2">导出数据</button>
                <label class="bg-yellow-500 text-white px-3 py-1 rounded inline-block cursor-pointer">
                    导入数据
                    <input type="file" id="import-file" accept=".json" class="hidden">
                </label>
                <button id="clear-data" class="bg-red-500 text-white px-3 py-1 rounded ml-2">清空所有数据</button>
            </div>
        </div>
    `;
    document.getElementById('go-roles-btn')?.addEventListener('click', () => showRolesView());
    document.getElementById('set-card-view')?.addEventListener('click', () => {
        setViewMode('card');
        showSettingsView();
        showBooksView();
    });
    document.getElementById('set-list-view')?.addEventListener('click', () => {
        setViewMode('list');
        showSettingsView();
        showBooksView();
    });
    document.getElementById('export-btn')?.addEventListener('click', exportData);
    document.getElementById('import-file')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const mode = confirm('选择“确定”将合并数据，取消则覆盖现有数据') ? 'merge' : 'overwrite';
            try {
                await importData(file, mode);
                alert('导入成功');
                location.reload();
            } catch (err) {
                alert('导入失败：' + err.message);
            }
        }
    });
    document.getElementById('clear-data')?.addEventListener('click', async () => {
        if (confirm('⚠️ 此操作将清空所有图书、角色和阅读记录，不可恢复！确定吗？')) {
            await db.books.clear();
            await db.roles.clear();
            await db.reading_records.clear();
            await initDefaultRoles();
            await showBooksView();
            alert('已清空所有数据');
        }
    });
}

function setupNavigation() {
    navBooks.addEventListener('click', showBooksView);
    navAdd.addEventListener('click', () => showAddBookForm());
    navStats.addEventListener('click', showStatsView);
    navSettings.addEventListener('click', showSettingsView);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function getStatusText(status) {
    switch(status) {
        case 'unread': return '未读';
        case 'reading': return '正在阅读';
        case 'read': return '已读完';
        default: return '未知';
    }
}

// 启动应用
init();