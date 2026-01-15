// ========================================
// SISTEMA DE CACHÉ DE MODELOS FBX (IndexedDB)
// ========================================
// Cachea los modelos FBX en IndexedDB para cargas instantáneas

const FBXCache = {
    dbName: 'SiumFBXCache',
    dbVersion: 1,
    storeName: 'models',
    db: null,
    enabled: true,

    // Inicializar IndexedDB
    init: function () {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                this.enabled = false;
                resolve(false);
                return;
            }

            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                this.enabled = false;
                resolve(false);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(true);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'url' });
                }
            };
        });
    },

    // Guardar modelo serializado
    save: function (url, modelData) {
        if (!this.enabled || !this.db) return Promise.resolve(false);

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                store.put({
                    url: url,
                    data: modelData,
                    timestamp: Date.now()
                });
                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
        });
    },

    // Cargar modelo desde caché
    load: function (url) {
        if (!this.enabled || !this.db) return Promise.resolve(null);

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(url);

                request.onsuccess = () => {
                    if (request.result) {
                        // Verificar que no tenga más de 24 horas
                        const age = Date.now() - request.result.timestamp;
                        if (age < 24 * 60 * 60 * 1000) {
                            resolve(request.result.data);
                            return;
                        }
                    }
                    resolve(null);
                };

                request.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    },

    // Limpiar caché
    clear: function () {
        if (!this.enabled || !this.db) return;
        try {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            store.clear();
        } catch (e) { }
    }
};

// ========================================
// CARGA OPTIMIZADA DE FBX
// ========================================

// Precargar todos los modelos en paralelo
var modelosPreCargados = {};
var modelosCargando = false;

async function precargarModelos() {
    if (modelosCargando) return;
    modelosCargando = true;

    // Inicializar IndexedDB
    await FBXCache.init();

    const modelos = [
        'modelos/armas/pistola.fbx',
        'modelos/personajes/caminar.fbx',
        'modelos/personajes/parado.fbx'
    ];

    // Cargar todos en paralelo
    const promesas = modelos.map(url => cargarModeloOptimizado(url));
    await Promise.all(promesas);

    modelosCargando = false;
}

// Cargar modelo con caché
function cargarModeloOptimizado(url) {
    return new Promise((resolve) => {
        assetsLoader.track();

        const loader = new THREE.FBXLoader();
        loader.load(url,
            (object) => {
                modelosPreCargados[url] = object;
                assetsLoader.loaded(url.split('/').pop());
                resolve(object);
            },
            undefined,
            (error) => {
                console.error('Error FBX:', url);
                assetsLoader.loaded(url.split('/').pop() + ' (error)');
                resolve(null);
            }
        );
    });
}

// Obtener modelo ya cargado o clonar
function obtenerModelo(url) {
    const original = modelosPreCargados[url];
    if (original) {
        // Clonar para reutilizar
        return original.clone();
    }
    return null;
}
