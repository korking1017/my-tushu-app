let html5QrCode = null;

export async function startScanner(onSuccess, onError) {
    const scannerContainer = document.createElement('div');
    scannerContainer.id = 'qr-reader';
    scannerContainer.style.width = '100%';
    scannerContainer.style.maxWidth = '500px';
    scannerContainer.style.margin = '0 auto';
    
    const modal = document.getElementById('modal-container');
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = '';
    modalContent.appendChild(scannerContainer);
    modal.classList.remove('hidden');

    html5QrCode = new Html5Qrcode("qr-reader");
    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
                stopScanner();
                modal.classList.add('hidden');
                onSuccess(decodedText);
            },
            (error) => {
                // 忽略扫描过程中的错误
            }
        );
    } catch (err) {
        console.error('启动摄像头失败:', err);
        onError('无法启动摄像头，请检查权限');
        modal.classList.add('hidden');
    }
}

export function stopScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
    }
}

// 关闭弹窗时停止扫描
document.getElementById('modal-container').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-container')) {
        stopScanner();
        document.getElementById('modal-container').classList.add('hidden');
    }
});