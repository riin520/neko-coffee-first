// ==============================================================
// BÍ KÍP TÀ ĐẠO: SERVICE WORKER KHÔNG LƯU CACHE (CHỐNG BUG)
// ==============================================================

self.addEventListener('install', (event) => {
    // Cài phát ăn luôn, không chờ đợi
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Bắt đầu kiểm soát app ngay lập tức
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // LUÔN LUÔN LẤY DATA MỚI NHẤT TỪ SERVER (BỎ QUA CACHE)
    // đảm bảo không bao giờ kẹt code cũ!
    event.respondWith(
        fetch(event.request).catch(() => {
            console.log("Mất mạng hoặc Server ngủ rồi!");
        })
    );
});