// ========================================
// MATERIALES COMPARTIDOS (Optimización)
// ========================================
var matPared = null;
var matHueco = null;
var matSuelo = null;

async function generarLaberinto() {
    if (matchLoadingTracker) matchLoadingTracker.setStatus("Procesando estructura del nivel...");

    // IMPORTANTE: Si estamos en modo multijugador y el servidor envió un mapa, usarlo
    if (typeof window !== 'undefined' && window.mapaServidor) {
        laberinto = JSON.parse(JSON.stringify(window.mapaServidor)); // Copia profunda
        window.mapaServidor = null;
    } else {
        // Generación de mapa local (Síncrona pero rápida, el cuello de botella es el renderizado)
        for (let y = 0; y < DIMENSION; y++) {
            laberinto[y] = [];
            for (let x = 0; x < DIMENSION; x++) laberinto[y][x] = 1;
        }

        function excavar(x, y) {
            laberinto[y][x] = 0;
            const direcciones = [[0, 2], [0, -2], [2, 0], [-2, 0]].sort(() => Math.random() - 0.5);
            for (let [dx, dy] of direcciones) {
                let nx = x + dx, ny = y + dy;
                if (nx > 0 && nx < DIMENSION - 1 && ny > 0 && ny < DIMENSION - 1 && laberinto[ny][nx] === 1) {
                    laberinto[y + dy / 2][x + dx / 2] = 0;
                    excavar(nx, ny);
                }
            }
        }
        excavar(1, 1);

        for (let y = 1; y < DIMENSION - 1; y++) {
            for (let x = 1; x < DIMENSION - 1; x++) {
                if (laberinto[y][x] === 1 && Math.random() < 0.15) {
                    const horiz = laberinto[y][x - 1] === 0 && laberinto[y][x + 1] === 0;
                    const vert = laberinto[y - 1][x] === 0 && laberinto[y + 1][x] === 0;
                    if (horiz || vert) {
                        laberinto[y][x] = 2;
                    }
                }
            }
        }
    }

    // Pequeño respiro para el navegador antes de empezar con Three.js
    await new Promise(r => setTimeout(r, 0));

    // --- Carga de Texturas y Materiales (Solo si no existen) ---
    if (!matPared || !matSuelo) {
        const texPared = cargarTextura('texturas/pared.png');
        const texSuelo = cargarTextura('texturas/suelo.png', (tex) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(DIMENSION, DIMENSION);
        });

        matPared = new THREE.MeshStandardMaterial({ map: texPared, color: 0x222222, roughness: 0.9 });
        matHueco = new THREE.MeshStandardMaterial({ map: texPared, color: 0xbbbbbb, roughness: 0.9 });
        matSuelo = new THREE.MeshStandardMaterial({ map: texSuelo, color: 0x888888, roughness: 0.8 });
    }

    // Primera fase del mundo lista (Texturas y Materiales)
    if (matchLoadingTracker) matchLoadingTracker.track();

    // --- Geometría Consolidada (One-pass iteration) ---
    if (matchLoadingTracker) matchLoadingTracker.setStatus("Construyendo arena...");

    const posPared = [], normPared = [], uvPared = [];
    const posHueco = [], normHueco = [], uvHueco = [];

    const addQuad = (pArr, nArr, uArr, v1, v2, v3, v4, n) => {
        pArr.push(...v1, ...v2, ...v3, ...v1, ...v3, ...v4);
        nArr.push(...n, ...n, ...n, ...n, ...n, ...n);
        uArr.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    };

    const offset = (DIMENSION * ESCALA) / 2;
    const hTop = 7;
    const dim = ESCALA / 2;

    for (let y = 0; y < DIMENSION; y++) {
        for (let x = 0; x < DIMENSION; x++) {
            const tile = laberinto[y][x];
            if (tile === 0) continue;

            const cx = x * ESCALA - offset;
            const cz = y * ESCALA - offset;
            const xMin = cx - dim, xMax = cx + dim;
            const zMin = cz - dim, zMax = cz + dim;

            const isGap = (tile === 2);
            const hBot = isGap ? 1.8 : 0;
            const pArr = isGap ? posHueco : posPared;
            const nArr = isGap ? normHueco : normPared;
            const uArr = isGap ? uvHueco : uvPared;

            // 1. CARA SUPERIOR
            addQuad(pArr, nArr, uArr, [xMin, hTop, zMax], [xMax, hTop, zMax], [xMax, hTop, zMin], [xMin, hTop, zMin], [0, 1, 0]);

            // 2. CARA INFERIOR (Solo para huecos)
            if (isGap) {
                addQuad(pArr, nArr, uArr, [xMin, hBot, zMin], [xMax, hBot, zMin], [xMax, hBot, zMax], [xMin, hBot, zMax], [0, -1, 0]);
            }

            // 3. CARAS LATERALES (Optimizado con Hidden Face Removal)
            // Norte
            let vN = (y > 0) ? laberinto[y - 1][x] : 0;
            if (vN === 0 || (tile === 1 && vN === 2)) {
                addQuad(pArr, nArr, uArr, [xMax, hBot, zMin], [xMin, hBot, zMin], [xMin, hTop, zMin], [xMax, hTop, zMin], [0, 0, -1]);
            }
            // Sur
            let vS = (y < DIMENSION - 1) ? laberinto[y + 1][x] : 0;
            if (vS === 0 || (tile === 1 && vS === 2)) {
                addQuad(pArr, nArr, uArr, [xMin, hBot, zMax], [xMax, hBot, zMax], [xMax, hTop, zMax], [xMin, hTop, zMax], [0, 0, 1]);
            }
            // Este
            let vE = (x < DIMENSION - 1) ? laberinto[y][x + 1] : 0;
            if (vE === 0 || (tile === 1 && vE === 2)) {
                addQuad(pArr, nArr, uArr, [xMax, hBot, zMax], [xMax, hBot, zMin], [xMax, hTop, zMin], [xMax, hTop, zMax], [1, 0, 0]);
            }
            // Oeste
            let vO = (x > 0) ? laberinto[y][x - 1] : 0;
            if (vO === 0 || (tile === 1 && vO === 2)) {
                addQuad(pArr, nArr, uArr, [xMin, hBot, zMin], [xMin, hBot, zMax], [xMin, hTop, zMax], [xMin, hTop, zMin], [-1, 0, 0]);
            }
        }
    }

    const buildMesh = (pos, norm, uv, mat) => {
        if (pos.length === 0) return null;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = "mallaLaberinto";
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    };

    const mesh1 = buildMesh(posPared, normPared, uvPared, matPared);
    const mesh2 = buildMesh(posHueco, normHueco, uvHueco, matHueco);
    if (mesh1) escena.add(mesh1);
    if (mesh2) escena.add(mesh2);

    // Segunda fase del mundo lista
    if (matchLoadingTracker) matchLoadingTracker.track();

    // --- Suelo (Reutilización) ---
    let suelo = escena.getObjectByName("sueloMundo");
    if (!suelo) {
        if (matchLoadingTracker) matchLoadingTracker.setStatus("Instalando suelo...");
        const geoSuelo = new THREE.PlaneGeometry(DIMENSION * ESCALA, DIMENSION * ESCALA);
        suelo = new THREE.Mesh(geoSuelo, matSuelo);
        suelo.name = "sueloMundo";
        suelo.rotation.x = -Math.PI / 2;
        suelo.receiveShadow = true;
        escena.add(suelo);
    }

    if (matchLoadingTracker) matchLoadingTracker.setStatus("Mundo listo");
}

function limpiarMundo() {
    if (!escena) return;
    const toRemove = [];
    escena.children.forEach(obj => {
        if (obj.name === "mallaLaberinto") {
            toRemove.push(obj);
        }
    });
    toRemove.forEach(obj => {
        if (obj.geometry) obj.geometry.dispose();
        escena.remove(obj);
    });
}

function colision(nx, nz, agachado = false, radio = 0.5) {
    const offset = (DIMENSION * ESCALA) / 2;

    // CB-10: Optimización - Evitar creación de objetos/arrays cada frame (Zero-Allocation)
    // Verificar centro
    let gx = Math.round((nx + offset) / ESCALA);
    let gz = Math.round((nz + offset) / ESCALA);
    let tile = laberinto[gz]?.[gx];
    if (tile === 1 || (tile === 2 && !agachado)) return true;

    // Verificar derecha
    gx = Math.round((nx + radio + offset) / ESCALA);
    tile = laberinto[gz]?.[gx];
    if (tile === 1 || (tile === 2 && !agachado)) return true;

    // Verificar izquierda
    gx = Math.round((nx - radio + offset) / ESCALA);
    tile = laberinto[gz]?.[gx];
    if (tile === 1 || (tile === 2 && !agachado)) return true;

    // Verificar abajo
    gx = Math.round((nx + offset) / ESCALA);
    gz = Math.round((nz + radio + offset) / ESCALA);
    tile = laberinto[gz]?.[gx];
    if (tile === 1 || (tile === 2 && !agachado)) return true;

    // Verificar arriba
    gz = Math.round((nz - radio + offset) / ESCALA);
    tile = laberinto[gz]?.[gx];
    if (tile === 1 || (tile === 2 && !agachado)) return true;

    return false;
}
