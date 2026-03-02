const CACHE_NAME = "natacion-cache-v1";

// Lista de archivos para acceso offline
const urlsToCache = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-512.png"
];

// Instalación del Service Worker
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("Cache abierto correctamente");
        return cache.addAll(urlsToCache);
      })
  );
});

// Estrategia de respuesta: Cache primero, luego red
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retorna el recurso desde el cache o va a buscarlo a la red
        return response || fetch(event.request);
      })
  );
});