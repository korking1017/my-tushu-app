import { getAllBooks, getAllRoles, getReadingRecordsByBook } from './db.js';

let currentView = localStorage.getItem('viewMode') || 'card'; // 'card' or 'list'

export function setViewMode(mode) {
    currentView = mode;
    localStorage.setItem('viewMode', mode);
}

export async function renderBookList(container, books, onEdit, onDelete, onStartReading, onCompleteReading, onReread) {
    if (!books || books.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-8">暂无图书，点击“添加”按钮录入</div>';
        return;
    }
    const roles = await getAllRoles();
    const roleMap = new Map(roles.map(r => [r.id, r.name]));

    if (currentView === 'card') {
        container.className = 'grid-view';
        container.innerHTML = books.map(book => `
            <div class="book-card bg-white rounded-lg shadow p-3 ${book.isTreasury ? 'treasury-border' : ''}" data-id="${book.id}">
                ${book.cover ? `<img src="${book.cover}" alt="封面" class="w-full h-40 object-cover rounded mb-2">` : '<div class="w-full h-40 bg-gray-200 rounded mb-2 flex items-center justify-center"><i class="fas fa-book text-gray-400 text-4xl"></i></div>'}
                <h3 class="font-bold text-sm truncate">${escapeHtml(book.title)}</h3>
                <p class="text-xs text-gray-600 truncate">${escapeHtml(book.author)}</p>
                <div class="flex justify-between items-center mt-2">
                    <span class="text-xs px-2 py-1 rounded-full ${getStatusColor(book.status)}">${getStatusText(book.status)}</span>
                    <div>
                        <button class="edit-book text-blue-500 mr-2" data-id="${book.id}"><i class="fas fa-edit"></i></button>
                        <button class="delete-book text-red-500" data-id="${book.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        container.className = 'list-view';
        container.innerHTML = books.map(book => `
            <div class="bg-white rounded-lg shadow p-3 flex justify-between items-center ${book.isTreasury ? 'list-item-treasury' : ''}" data-id="${book.id}">
                <div class="flex-1">
                    <div class="font-bold">${escapeHtml(book.title)}</div>
                    <div class="text-xs text-gray-600">${escapeHtml(book.author)} | ${escapeHtml(book.category || '未分类')}</div>
                    <div class="text-xs mt-1">
                        <span class="px-2 py-0.5 rounded-full ${getStatusColor(book.status)}">${getStatusText(book.status)}</span>
                        ${book.location ? `<span class="ml-2"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(book.location)}</span>` : ''}
                    </div>
                </div>
                <div>
                    <button class="edit-book text-blue-500 mr-2" data-id="${book.id}"><i class="fas fa-edit"></i></button>
                    <button class="delete-book text-red-500" data-id="${book.id}"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    }

    // 绑定事件
    container.querySelectorAll('.edit-book').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onEdit(parseInt(btn.dataset.id));
        });
    });
    container.querySelectorAll('.delete-book').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onDelete(parseInt(btn.dataset.id));
        });
    });
    // 卡片/列表项点击进入详情
    container.querySelectorAll('[data-id]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.edit-book') || e.target.closest('.delete-book')) return;
            const id = parseInt(el.dataset.id);
            // 触发详情展示，由外部传入回调
            if (typeof window.showBookDetail === 'function') {
                window.showBookDetail(id);
            }
        });
    });
}

function getStatusColor(status) {
    switch(status) {
        case 'unread': return 'bg-gray-200 text-gray-800';
        case 'reading': return 'bg-yellow-100 text-yellow-800';
        case 'read': return 'bg-green-100 text-green-800';
        default: return 'bg-gray-200';
    }
}

function getStatusText(status) {
    switch(status) {
        case 'unread': return '未读';
        case 'reading': return '正在阅读';
        case 'read': return '已读完';
        default: return '未知';
    }
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