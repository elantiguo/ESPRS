// ========================================
// SISTEMA DE CARGA DE ASSETS
// ========================================

var assetsLoader = {
    totalAssets: 0,
    loadedAssets: 0,
    isReady: false,
    callbacks: [],
    startTime: Date.now(),

    // Detectar si ya se cargó antes (assets en caché del navegador)
    isCached: localStorage.getItem('siumAssetsLoaded') === 'true',

    // Tiempo mínimo de pantalla de carga: 0ms si cached, 100ms primera vez
    get minDisplayTime() {
        return this.isCached ? 0 : 100;
    },

    // Registrar un asset para tracking
    track: function () {
        this.totalAssets++;
    },

    // Marcar un asset como cargado
    loaded: function (assetName) {
        this.loadedAssets++;
        this.updateProgress(assetName);
        this.checkComplete();
    },

    // Actualizar barra de progreso
    updateProgress: function (assetName) {
        const percent = this.totalAssets > 0
            ? Math.round((this.loadedAssets / this.totalAssets) * 100)
            : 0;
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');

        if (progressBar) {
            progressBar.style.width = percent + '%';
        }
        if (progressText) {
            // Mostrar "desde caché" si es recarga
            const cacheMsg = this.isCached ? ' (caché)' : '';
            progressText.textContent = `Cargando ${assetName}${cacheMsg}... ${percent}%`;
        }
    },

    // Verificar si todo está listo
    checkComplete: function () {
        if (this.loadedAssets >= this.totalAssets && this.totalAssets > 0 && !this.isReady) {
            this.isReady = true;

            // Marcar como cargado para próximas recargas
            try {
                localStorage.setItem('siumAssetsLoaded', 'true');
            } catch (e) { /* localStorage no disponible */ }

            // Esperar mínimo minDisplayTime antes de ocultar
            const elapsed = Date.now() - this.startTime;
            const delay = Math.max(100, this.minDisplayTime - elapsed);

            setTimeout(() => {
                this.hideLoadingScreen();
                this.callbacks.forEach(cb => cb());
            }, delay);
        }
    },

    // Ocultar pantalla de carga
    hideLoadingScreen: function () {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('opacity-0');
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 1100); // 1.1s for the 1s transition
        }
    },

    // Agregar callback cuando todo esté listo
    onReady: function (callback) {
        if (this.isReady) {
            callback();
        } else {
            this.callbacks.push(callback);
        }
    },

    // Limpiar caché de localStorage
    clearCache: function () {
        try {
            localStorage.removeItem('siumAssetsLoaded');
        } catch (e) { }
    }
};

// ========================================
// TRACKER DE CARGA DE PARTIDA (MODELOS)
// ========================================
var matchLoadingTracker = {
    total: 0,
    loaded: 0,
    isActive: false,

    start: function (total) {
        this.total = total;
        this.loaded = 0;
        this.isActive = true;
        this.updateUI();
        document.getElementById('match-loading-screen').classList.remove('hidden');
    },

    track: function () {
        if (!this.isActive) return;
        this.loaded++;
        this.updateUI();
        if (this.loaded >= this.total) {
            this.complete();
        }
    },

    updateUI: function () {
        const percent = this.total > 0 ? Math.round((this.loaded / this.total) * 100) : 0;
        const bar = document.getElementById('match-progress-bar');
        const text = document.getElementById('match-progress-percent');
        if (bar) bar.style.width = percent + '%';
        if (text) text.textContent = percent + '%';
    },

    complete: function () {
        this.isActive = false;
        setTimeout(() => {
            document.getElementById('match-loading-screen').classList.add('opacity-0');
            setTimeout(() => {
                document.getElementById('match-loading-screen').classList.add('hidden');
                document.getElementById('match-loading-screen').classList.remove('opacity-0');
            }, 600);
        }, 500);
    }
};

// ========================================
// FUNCIONES DE CARGA TRACKED
// ========================================

// Cargar textura con tracking
function cargarTextura(url, onLoad) {
    assetsLoader.track();
    const loader = new THREE.TextureLoader();
    return loader.load(url,
        (texture) => {
            assetsLoader.loaded(url.split('/').pop());
            if (onLoad) onLoad(texture);
        },
        undefined,
        (error) => {
            console.error('Error cargando textura:', url, error);
            assetsLoader.loaded(url.split('/').pop() + ' (error)');
        }
    );
}

// Cargar FBX con tracking
function cargarFBX(url, onLoad) {
    assetsLoader.track();
    const loader = new THREE.FBXLoader();

    // Configurar la ruta base para que encuentre las texturas
    // Extrae el directorio del URL (ej: 'modelos/personajes/' de 'modelos/personajes/caminar.fbx')
    const basePath = url.substring(0, url.lastIndexOf('/') + 1);
    loader.setPath(basePath);
    loader.setResourcePath(basePath);

    // El nombre del archivo sin la ruta
    const fileName = url.split('/').pop();

    loader.load(fileName,
        (object) => {
            // Debug: mostrar información de materiales y texturas
            console.log('FBX cargado:', url);
            object.traverse((child) => {
                if (child.isMesh && child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach((mat, i) => {
                        console.log(`  Material [${i}]: ${mat.name}, tiene textura: ${mat.map ? 'SI' : 'NO'}`);
                        if (mat.map) {
                            console.log(`    Textura: ${mat.map.name || mat.map.image?.src || 'sin nombre'}`);
                        }
                    });
                }
            });

            assetsLoader.loaded(url.split('/').pop());
            if (onLoad) onLoad(object);
        },
        undefined,
        (error) => {
            console.error('Error cargando FBX:', url, error);
            assetsLoader.loaded(url.split('/').pop() + ' (error)');
        }
    );
}

// ========================================
// VERSIÓN PROMISE PARA CARGA PARALELA (CB-01)
// ========================================
function cargarFBXPromise(url) {
    return new Promise((resolve, reject) => {
        assetsLoader.track();
        const loader = new THREE.FBXLoader();

        const basePath = url.substring(0, url.lastIndexOf('/') + 1);
        loader.setPath(basePath);
        loader.setResourcePath(basePath);

        const fileName = url.split('/').pop();

        loader.load(fileName,
            (object) => {
                console.log('FBX cargado (Promise):', url);
                assetsLoader.loaded(url.split('/').pop());
                resolve(object);
            },
            undefined,
            (error) => {
                console.error('Error cargando FBX (Promise):', url, error);
                assetsLoader.loaded(url.split('/').pop() + ' (error)');
                reject(error);
            }
        );
    });
}

