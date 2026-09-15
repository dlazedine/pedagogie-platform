// ============================================================
//  Service Worker — منصة المعالجة البيداغوجية
//  يوفر العمل بدون إنترنت + تخزين مؤقت ذكي
// ============================================================

const CACHE_NAME = 'pgb-cache-v4.2';
const RUNTIME_CACHE = 'pgb-runtime-v4.2';

// الملفات الأساسية التي يجب تخزينها دائماً
const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './images/wizara.png',
    './images/muqataa.png',
    './images/icons/icon-192x192.png',
    './images/icons/icon-512x512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// ============================================================
//  INSTALL — تثبيت Service Worker
// ============================================================
self.addEventListener('install', event => {
    console.log('[SW] جاري التثبيت...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] تخزين الملفات الأساسية');
                return cache.addAll(CORE_ASSETS.map(url => {
                    return new Request(url, { mode: 'no-cors' });
                }));
            })
            .then(() => {
                console.log('[SW] ✅ تم التثبيت');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('[SW] ❌ خطأ في التثبيت:', error);
            })
    );
});

// ============================================================
//  ACTIVATE — تنشيط Service Worker
// ============================================================
self.addEventListener('activate', event => {
    console.log('[SW] جاري التنشيط...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
                            console.log('[SW] حذف cache قديم:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] ✅ تم التنشيط');
                return self.clients.claim();
            })
    );
});

// ============================================================
//  FETCH — اعتراض الطلبات
// ============================================================
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // تجاهل الطلبات غير GET
    if (request.method !== 'GET') return;
    
    // تجاهل طلبات Chrome extensions
    if (url.protocol === 'chrome-extension:') return;
    
    // استراتيجية خاصة للملفات الأساسية: Cache First
    if (url.pathname.endsWith('.html') || 
        url.pathname.endsWith('.json') ||
        url.pathname === '/' ||
        url.pathname.endsWith('/')) {
        event.respondWith(cacheFirst(request));
        return;
    }
    
    // استراتيجية للصور والأيقونات: Cache First
    if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/)) {
        event.respondWith(cacheFirst(request));
        return;
    }
    
    // استراتيجية للـ CSS والـ JS الخارجية: Stale While Revalidate
    if (url.pathname.match(/\.(css|js)$/)) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }
    
    // الافتراضي: Network First
    event.respondWith(networkFirst(request));
});

// ============================================================
//  استراتيجيات التخزين
// ============================================================

// Cache First — البحث في Cache أولاً
async function cacheFirst(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            // تحديث Cache في الخلفية
            fetchAndCache(request).catch(() => {});
            return cachedResponse;
        }
        
        // إذا لم يوجد في Cache، جلبه من الشبكة
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        // إذا فشل كل شيء، حاول جلب index.html
        const fallback = await caches.match('./index.html');
        return fallback || new Response('Offline', { status: 503 });
    }
}

// Network First — الشبكة أولاً
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        
        // fallback لصفحة index.html
        const fallback = await caches.match('./index.html');
        return fallback || new Response('Offline', { status: 503 });
    }
}

// Stale While Revalidate — Cache + تحديث في الخلفية
async function staleWhileRevalidate(request) {
    const cachedResponse = await caches.match(request);
    
    const fetchPromise = fetch(request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
            caches.open(RUNTIME_CACHE).then(cache => {
                cache.put(request, networkResponse.clone());
            });
        }
        return networkResponse;
    }).catch(() => null);
    
    return cachedResponse || fetchPromise;
}

// جلب في الخلفية وتحديث Cache
async function fetchAndCache(request) {
    const response = await fetch(request);
    if (response && response.status === 200) {
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, response.clone());
    }
    return response;
}

// ============================================================
//  MESSAGE — التواصل مع الصفحة
// ============================================================
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.keys().then(names => {
            names.forEach(name => caches.delete(name));
        });
    }
});

// ============================================================
//  PUSH — الإشعارات (اختياري)
// ============================================================
self.addEventListener('push', event => {
    const options = {
        body: event.data ? event.data.text() : 'لديك مهمة جديدة',
        icon: './images/icons/icon-192x192.png',
        badge: './images/icons/icon-96x96.png',
        vibrate: [200, 100, 200],
        dir: 'rtl',
        lang: 'ar',
        actions: [
            { action: 'open', title: 'فتح التطبيق' },
            { action: 'close', title: 'إغلاق' }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('منصة المعالجة البيداغوجية', options)
    );
});

// النقر على الإشعار
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.openWindow('./')
        );
    }
});

console.log('[SW] ✅ Service Worker جاهز');