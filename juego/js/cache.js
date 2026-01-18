// ========================================
// SISTEMA DE CACHÉ AVANZADO
// ========================================
// Caché multi-propósito con TTL y estrategia LRU

class GameCache {
    constructor() {
        // CB-70: TTL más largo en móviles para reducir recálculos
        const isMobile = (typeof esDispositivoTactil !== 'undefined' && esDispositivoTactil);

        // Caché de rutas A* con TTL
        this.pathCache = new Map();
        this.pathCacheMaxSize = isMobile ? 30 : 20;
        this.pathCacheTTL = isMobile ? 1000 : 500; // 1 segundo en móvil

        // Caché de línea de visión
        this.visionCache = new Map();
        this.visionCacheTTL = isMobile ? 300 : 100; // 300ms en móvil

        // Caché de colisiones
        this.collisionCache = new Map();
        this.collisionCacheMaxSize = 100;

        // Caché de celdas caminables (estático, no expira)
        this.walkableCache = null;

        // Estadísticas
        this.stats = {
            pathHits: 0,
            pathMisses: 0,
            visionHits: 0,
            visionMisses: 0
        };
    }

    // ========================================
    // CACHÉ DE RUTAS A* (Path Cache)
    // ========================================

    // Generar clave única para un par inicio-destino
    getPathKey(startX, startZ, endX, endZ) {
        // Redondear a celdas de grid para agrupar posiciones cercanas
        const sx = Math.round(startX);
        const sz = Math.round(startZ);
        const ex = Math.round(endX);
        const ez = Math.round(endZ);
        return `${sx},${sz}->${ex},${ez}`;
    }

    // Obtener ruta del caché
    getPath(startX, startZ, endX, endZ) {
        const key = this.getPathKey(startX, startZ, endX, endZ);
        const cached = this.pathCache.get(key);

        if (cached && (Date.now() - cached.timestamp) < this.pathCacheTTL) {
            this.stats.pathHits++;
            // Mover al final (LRU)
            this.pathCache.delete(key);
            this.pathCache.set(key, cached);
            return cached.path;
        }

        this.stats.pathMisses++;
        return null;
    }

    // Almacenar ruta en caché
    setPath(startX, startZ, endX, endZ, path) {
        const key = this.getPathKey(startX, startZ, endX, endZ);

        // Limpiar entradas viejas si llegamos al límite
        if (this.pathCache.size >= this.pathCacheMaxSize) {
            const firstKey = this.pathCache.keys().next().value;
            this.pathCache.delete(firstKey);
        }

        this.pathCache.set(key, {
            path: path,
            timestamp: Date.now()
        });
    }

    // ========================================
    // CACHÉ DE LÍNEA DE VISIÓN
    // ========================================

    getVisionKey(botX, botZ, playerX, playerZ) {
        // Redondear a posiciones más gruesas (menor precisión = más hits)
        const bx = Math.round(botX * 2) / 2;
        const bz = Math.round(botZ * 2) / 2;
        const px = Math.round(playerX * 2) / 2;
        const pz = Math.round(playerZ * 2) / 2;
        return `${bx},${bz}|${px},${pz}`;
    }

    getVision(botX, botZ, playerX, playerZ) {
        const key = this.getVisionKey(botX, botZ, playerX, playerZ);
        const cached = this.visionCache.get(key);

        if (cached && (Date.now() - cached.timestamp) < this.visionCacheTTL) {
            this.stats.visionHits++;
            return cached.result;
        }

        this.stats.visionMisses++;
        return null;
    }

    setVision(botX, botZ, playerX, playerZ, result) {
        const key = this.getVisionKey(botX, botZ, playerX, playerZ);

        // Limpiar caché de visión cada 50 entradas
        if (this.visionCache.size > 50) {
            this.visionCache.clear();
        }

        this.visionCache.set(key, {
            result: result,
            timestamp: Date.now()
        });
    }

    // ========================================
    // CACHÉ DE CELDAS CAMINABLES (Estático)
    // ========================================

    buildWalkableCache(laberinto, dimension) {
        if (this.walkableCache) return;

        this.walkableCache = new Set();
        for (let z = 0; z < dimension; z++) {
            for (let x = 0; x < dimension; x++) {
                if (laberinto[z] && (laberinto[z][x] === 0 || laberinto[z][x] === 2)) {
                    this.walkableCache.add(`${x},${z}`);
                }
            }
        }
    }

    isWalkable(x, z) {
        if (!this.walkableCache) return false;
        return this.walkableCache.has(`${x},${z}`);
    }

    // ========================================
    // UTILIDADES
    // ========================================

    // Limpiar todos los cachés (al reiniciar juego)
    clear() {
        this.pathCache.clear();
        this.visionCache.clear();
        this.collisionCache.clear();
        this.stats = { pathHits: 0, pathMisses: 0, visionHits: 0, visionMisses: 0 };
    }

    // Obtener estadísticas de rendimiento
    getStats() {
        const pathTotal = this.stats.pathHits + this.stats.pathMisses;
        const visionTotal = this.stats.visionHits + this.stats.visionMisses;
        return {
            pathHitRate: pathTotal > 0 ? (this.stats.pathHits / pathTotal * 100).toFixed(1) + '%' : 'N/A',
            visionHitRate: visionTotal > 0 ? (this.stats.visionHits / visionTotal * 100).toFixed(1) + '%' : 'N/A',
            pathCacheSize: this.pathCache.size,
            visionCacheSize: this.visionCache.size
        };
    }
}

// Variable global del caché
var gameCache = null;

function inicializarGameCache() {
    gameCache = new GameCache();
}
