// ============================================================
//  sw.js — النسخة المُصلحة v5.0
//  الإصلاحات:
//  1. Network First لـ HTML → لا نسخ قديمة
//  2. skipWaiting + clients.claim → تفعيل فوري
//  3. إصدار جديد → حذف كل الـ caches القديمة
//  4. عدم تخزين أي شيء فيه كلمات مرور
// ============================================================

const CACHE_VERSION = 'v5.0-' + Date.now(); // ⚡ فريد كل تحميل
const CACHE_NAME = 'pgb-cache-' + CACHE_VERSION;
const RUNTIME_CACHE = 'pgb-runtime-' + CACHE_VERSION;

self.addEventListener('install', event => {
    console.log('[SW v5.0] Installing...');
    // ⚡ لا ننتظر تخزين أي شيء — تفعيل فوري
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
    console.log('[SW v5.0] Activating...');
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            // ⚡ احذف كل caches القديمة بلا استثناء
            return Promise.all(
                cacheNames.map(cacheName => {
                    console.log('[SW] حذف cache:', cacheName);
                    return caches.delete(cacheName);
                })
            );
        }).then(() => {
            console.log('[SW v5.0] ✅ تم التنشيط — كل caches القديمة محذوفة');
            return self.clients.claim();
        }).then(() => {
            // ⚡ أخبر كل التبويبات المفتوحة بإعادة التحميل
            return self.clients.matchAll({ type: 'window' }).then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'SW_UPDATED' });
                });
            });
        })
    );
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    if (request.method !== 'GET') return;
    if (url.protocol === 'chrome-extension:') return;
    
    // ⚡ استراتيجية موحّدة: Network First للجميع
    // (لا cache للـ HTML → ضمان أحدث نسخة)
    event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
    try {
        // ⚡ الشبكة أولاً دائماً
        const networkResponse = await fetch(request, { cache: 'no-store' });
        
        // لا نخزّن HTML/JSON (فيه كلمات مرور محتملة)
        const url = new URL(request.url);
        const isHTML = request.destination === 'document' || 
                       url.pathname.endsWith('.html') ||
                       url.pathname.endsWith('.json') ||
                       url.pathname === '/';
        
        if (!isHTML && networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        // offline → حاول من cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        
        // للـ HTML: صفحة offline بسيطة
        if (request.destination === 'document') {
            return new Response(`
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>غير متصل</title>
                    <style>
                        body { font-family: 'Segoe UI', Tahoma; display: flex; 
                               align-items: center; justify-content: center; 
                               min-height: 100vh; margin: 0; background: #f0f4f8;
                               text-align: center; padding: 20px; }
                        .box { background: #fff; padding: 40px; border-radius: 14px;
                               box-shadow: 0 8px 30px rgba(0,0,0,0.1); max-width: 400px; }
                        h1 { color: #1a3d6e; margin: 0 0 10px; }
                        p { color: #5d7182; }
                        button { background: #1a3d6e; color: #fff; border: none;
                                 padding: 12px 30px; border-radius: 30px; 
                                 cursor: pointer; font-size: 15px; margin-top: 20px; 
                                 font-family: inherit; }
                    </style>
                </head>
                <body>
                    <div class="box">
                        <h1>📴 غير متصل</h1>
                        <p>يرجى الاتصال بالإنترنت لتحميل أحدث نسخة من المنصة.</p>
                        <button onclick="location.reload()">🔄 إعادة المحاولة</button>
                    </div>
                </body>
                </html>
            `, {
                status: 503,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }
        
        return new Response('Offline', { status: 503 });
    }
}

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
            .then(() => {
                event.source.postMessage({ type: 'CACHE_CLEARED' });
            });
    }
});

console.log('[SW v5.0] ✅ جاهز — Network First فقط، لا نسخ قديمة');