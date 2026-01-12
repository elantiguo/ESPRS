// ====================================
// PATHFINDING A* PARA BOT INTELIGENTE
// ====================================

class Nodo {
    constructor(x, y, g = 0, h = 0, padre = null) {
        this.x = x;
        this.y = y;
        this.g = g; // Costo desde inicio
        this.h = h; // Heurística hasta destino
        this.f = g + h; // Costo total
        this.padre = padre;
    }
}

class Pathfinder {
    constructor(laberintoRef, dimension, escala) {
        this.laberinto = laberintoRef;
        this.dimension = dimension;
        this.escala = escala;
        this.offset = (dimension * escala) / 2;

        // Caché de rutas para optimización
        this.rutaCache = null;
        this.ultimoDestino = null;
        this.ultimoInicio = null;
        this.contadorRecalculo = 0;
    }

    // Convertir posición del mundo a coordenadas de grid
    worldToGrid(x, z) {
        // Usar floor para consistencia con el sistema de colisión
        return {
            x: Math.floor((x + this.offset) / this.escala + 0.5),
            y: Math.floor((z + this.offset) / this.escala + 0.5)
        };
    }

    // Convertir coordenadas de grid a posición del mundo
    gridToWorld(gx, gy) {
        return {
            x: gx * this.escala - this.offset,
            z: gy * this.escala - this.offset
        };
    }

    // Heurística Manhattan (más rápida para grids)
    heuristica(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    // Verificar si una celda es caminable
    esCaminable(x, y) {
        if (x < 0 || x >= this.dimension || y < 0 || y >= this.dimension) {
            return false;
        }
        const tile = this.laberinto[y]?.[x];
        // 0 = pasillo, 2 = hueco (caminable si el bot puede agacharse)
        return tile === 0 || tile === 2;
    }

    // Obtener vecinos válidos (4 direcciones)
    obtenerVecinos(nodo) {
        const direcciones = [
            { x: 0, y: -1 }, // Arriba
            { x: 0, y: 1 },  // Abajo
            { x: -1, y: 0 }, // Izquierda
            { x: 1, y: 0 }   // Derecha
        ];

        const vecinos = [];
        for (const dir of direcciones) {
            const nx = nodo.x + dir.x;
            const ny = nodo.y + dir.y;
            if (this.esCaminable(nx, ny)) {
                vecinos.push({ x: nx, y: ny });
            }
        }
        return vecinos;
    }

    // Algoritmo A* principal
    encontrarRuta(inicioWorld, destinoWorld) {
        const inicio = this.worldToGrid(inicioWorld.x, inicioWorld.z);
        const destino = this.worldToGrid(destinoWorld.x, destinoWorld.z);

        // Verificar caché de rutas (nuevo sistema TTL)
        if (gameCache) {
            const cachedPath = gameCache.getPath(inicio.x, inicio.y, destino.x, destino.y);
            if (cachedPath) {
                return cachedPath;
            }
        }

        // También mantener el sistema de recálculo por frames como backup
        if (this.rutaCache && this.ultimoDestino && this.ultimoInicio) {
            const distDestinoChange = Math.abs(destino.x - this.ultimoDestino.x) +
                Math.abs(destino.y - this.ultimoDestino.y);
            const distInicioChange = Math.abs(inicio.x - this.ultimoInicio.x) +
                Math.abs(inicio.y - this.ultimoInicio.y);
            // Recalcular menos frecuentemente (30 frames = ~0.5 segundos a 60fps)
            if (distDestinoChange < 2 && distInicioChange < 2 && this.contadorRecalculo < 30) {
                this.contadorRecalculo++;
                return this.rutaCache;
            }
        }
        this.contadorRecalculo = 0;
        this.ultimoDestino = { ...destino };
        this.ultimoInicio = { ...inicio };

        // Verificar posiciones válidas
        if (!this.esCaminable(inicio.x, inicio.y)) {
            // Buscar celda más cercana caminable
            const cercana = this.buscarCeldaCercana(inicio);
            if (cercana) {
                inicio.x = cercana.x;
                inicio.y = cercana.y;
            } else {
                return null;
            }
        }

        if (!this.esCaminable(destino.x, destino.y)) {
            const cercana = this.buscarCeldaCercana(destino);
            if (cercana) {
                destino.x = cercana.x;
                destino.y = cercana.y;
            } else {
                return null;
            }
        }

        // Inicializar A*
        const abiertos = [];
        const cerrados = new Set();

        const nodoInicio = new Nodo(inicio.x, inicio.y, 0, this.heuristica(inicio, destino));
        abiertos.push(nodoInicio);

        let iteraciones = 0;
        const maxIteraciones = 1000; // Límite para evitar loops infinitos

        while (abiertos.length > 0 && iteraciones < maxIteraciones) {
            iteraciones++;

            // Encontrar nodo con menor f
            abiertos.sort((a, b) => a.f - b.f);
            const actual = abiertos.shift();

            // ¿Llegamos al destino?
            if (actual.x === destino.x && actual.y === destino.y) {
                this.rutaCache = this.reconstruirRuta(actual);
                // Guardar en caché TTL
                if (gameCache) {
                    gameCache.setPath(inicio.x, inicio.y, destino.x, destino.y, this.rutaCache);
                }
                return this.rutaCache;
            }

            cerrados.add(`${actual.x},${actual.y}`);

            // Explorar vecinos
            for (const vecino of this.obtenerVecinos(actual)) {
                const key = `${vecino.x},${vecino.y}`;
                if (cerrados.has(key)) continue;

                const g = actual.g + 1;
                const h = this.heuristica(vecino, destino);
                const nuevoNodo = new Nodo(vecino.x, vecino.y, g, h, actual);

                // ¿Ya está en abiertos con mejor costo?
                const existente = abiertos.find(n => n.x === vecino.x && n.y === vecino.y);
                if (existente) {
                    if (g < existente.g) {
                        existente.g = g;
                        existente.f = g + existente.h;
                        existente.padre = actual;
                    }
                } else {
                    abiertos.push(nuevoNodo);
                }
            }
        }

        // No se encontró ruta
        this.rutaCache = null;
        return null;
    }

    // Buscar celda caminable más cercana
    buscarCeldaCercana(pos) {
        for (let radio = 1; radio < 5; radio++) {
            for (let dx = -radio; dx <= radio; dx++) {
                for (let dy = -radio; dy <= radio; dy++) {
                    if (Math.abs(dx) === radio || Math.abs(dy) === radio) {
                        const nx = pos.x + dx;
                        const ny = pos.y + dy;
                        if (this.esCaminable(nx, ny)) {
                            return { x: nx, y: ny };
                        }
                    }
                }
            }
        }
        return null;
    }

    // Reconstruir ruta desde nodo final
    reconstruirRuta(nodo) {
        const ruta = [];
        let actual = nodo;
        while (actual) {
            const worldPos = this.gridToWorld(actual.x, actual.y);
            ruta.unshift(worldPos);
            actual = actual.padre;
        }
        return ruta;
    }

    // Obtener siguiente punto de la ruta
    obtenerSiguientePunto(posActualWorld, destinoWorld) {
        const ruta = this.encontrarRuta(posActualWorld, destinoWorld);

        if (!ruta || ruta.length < 2) {
            return null;
        }

        // Encontrar el punto más lejano visible en la ruta (suavizado)
        const posGrid = this.worldToGrid(posActualWorld.x, posActualWorld.z);

        // Retornar el segundo punto (el primero es la posición actual)
        // O un punto más adelante si está cerca
        for (let i = 1; i < Math.min(ruta.length, 4); i++) {
            const punto = ruta[i];
            const distancia = Math.sqrt(
                Math.pow(posActualWorld.x - punto.x, 2) +
                Math.pow(posActualWorld.z - punto.z, 2)
            );

            if (distancia > this.escala * 0.5) {
                return punto;
            }
        }

        return ruta[Math.min(1, ruta.length - 1)];
    }

    // Debug: Obtener ruta actual para visualización
    obtenerRutaActual() {
        return this.rutaCache;
    }
}

// Variable global del pathfinder (se inicializa después de generar el laberinto)
var pathfinder = null;

function inicializarPathfinder() {
    pathfinder = new Pathfinder(laberinto, DIMENSION, ESCALA);
}
