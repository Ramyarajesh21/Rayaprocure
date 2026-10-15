/* RayaProcure service worker: fast app shell + graceful offline page.
 * Never caches API calls or customer documents, only the app's own static files. */
const CACHE = "rayaprocure-shell-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/favicon.svg"];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== "GET" || url.origin !== self.location.origin) return;
    if (url.pathname.startsWith("/api/")) return;

    // Page navigations: network first, fall back to the cached shell when offline.
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request).catch(() => caches.match("/index.html").then((cached) => cached || Response.error()))
        );
        return;
    }

    // Hashed build assets and icons: cache first.
    if (url.pathname.startsWith("/assets/") || /\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
        event.respondWith(
            caches.match(request).then(
                (cached) =>
                    cached ||
                    fetch(request).then((response) => {
                        if (response.ok) {
                            const copy = response.clone();
                            caches.open(CACHE).then((cache) => cache.put(request, copy));
                        }
                        return response;
                    })
            )
        );
    }
});
