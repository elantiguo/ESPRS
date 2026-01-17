// ========================================
// MATERIALES COMPARTIDOS (Optimización)
// ========================================
var matPared = null;
var matHueco = null;
var matSuelo = null;

function generarLaberinto() {
    // IMPORTANTE: Si estamos en modo multijugador y el servidor envió un mapa, usarlo
    if (typeof window !== 'undefined' && window.mapaServidor) {
        console.log('🗺️ Usando mapa del servidor (multijugador)');
        laberinto = JSON.parse(JSON.stringify(window.mapaServidor)); // Copia profunda
        // Limpiar el mapa recibido para evitar reutilizarlo
        window.mapaServidor = null;
    } else {
        // Modo local: generar mapa aleatorio
        console.log('🗺️ Generando mapa local (modo individual)');
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

        // --- Generación de Huecos (Agacharse) ---
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

    // --- Carga de Texturas (tracked) ---
    const texPared = cargarTextura('texturas/pared.png');
    const texSuelo = cargarTextura('texturas/suelo.png', (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(DIMENSION, DIMENSION);
    });

    // Materiales compartidos globales
    matPared = new THREE.MeshStandardMaterial({ map: texPared, color: 0x222222, roughness: 0.9 });
    matHueco = new THREE.MeshStandardMaterial({ map: texPared, color: 0xbbbbbb, roughness: 0.9 });
    matSuelo = new THREE.MeshStandardMaterial({ map: texSuelo, color: 0x888888, roughness: 0.8 });

    // --- Contar paredes y huecos para InstancedMesh ---
    let countParedes = 0;
    let countHuecos = 0;
    for (let y = 0; y < DIMENSION; y++) {
        for (let x = 0; x < DIMENSION; x++) {
            if (laberinto[y][x] === 1) countParedes++;
            else if (laberinto[y][x] === 2) countHuecos++;
        }
    }

    const offset = (DIMENSION * ESCALA) / 2;
    const geoPared = new THREE.BoxGeometry(ESCALA, 7, ESCALA);
    const geoHueco = new THREE.BoxGeometry(ESCALA, 5.2, ESCALA);

    // --- InstancedMesh para paredes normales ---
    const instancedParedes = new THREE.InstancedMesh(geoPared, matPared, countParedes);
    instancedParedes.castShadow = true;
    instancedParedes.receiveShadow = true;

    // --- InstancedMesh para huecos ---
    const instancedHuecos = new THREE.InstancedMesh(geoHueco, matHueco, countHuecos);
    instancedHuecos.castShadow = true;
    instancedHuecos.receiveShadow = true;

    // Matriz de transformación reutilizable
    const matrix = new THREE.Matrix4();
    let iPared = 0;
    let iHueco = 0;

    for (let y = 0; y < DIMENSION; y++) {
        for (let x = 0; x < DIMENSION; x++) {
            const val = laberinto[y][x];
            if (val === 1) {
                matrix.setPosition(x * ESCALA - offset, 3.5, y * ESCALA - offset);
                instancedParedes.setMatrixAt(iPared++, matrix);
            } else if (val === 2) {
                matrix.setPosition(x * ESCALA - offset, 4.4, y * ESCALA - offset);
                instancedHuecos.setMatrixAt(iHueco++, matrix);
            }
        }
    }

    instancedParedes.instanceMatrix.needsUpdate = true;
    if (countHuecos > 0) instancedHuecos.instanceMatrix.needsUpdate = true;

    escena.add(instancedParedes);
    if (countHuecos > 0) escena.add(instancedHuecos);

    // --- Suelo ---
    const geoSuelo = new THREE.PlaneGeometry(DIMENSION * ESCALA, DIMENSION * ESCALA);
    const suelo = new THREE.Mesh(geoSuelo, matSuelo);
    suelo.rotation.x = -Math.PI / 2;
    suelo.receiveShadow = true;
    escena.add(suelo);
}

function colision(nx, nz, agachado = false, radio = 0.5) {
    const offset = (DIMENSION * ESCALA) / 2;

    // ========================================
    // CB-10: REDUCIR PUNTOS DE COLISIÓN DE 9 A 5
    // ========================================
    // Verificar puntos en cruz alrededor de la posición (centro + 4 cardinales)
    // Removemos las diagonales para reducir verificaciones de 9 a 5 (-44%)
    const puntos = [
        { x: nx, z: nz },               // Centro
        { x: nx + radio, z: nz },      // Derecha
        { x: nx - radio, z: nz },      // Izquierda
        { x: nx, z: nz + radio },      // Abajo
        { x: nx, z: nz - radio }       // Arriba
    ];

    for (let p of puntos) {
        const gx = Math.round((p.x + offset) / ESCALA);
        const gz = Math.round((p.z + offset) / ESCALA);
        const tile = laberinto[gz]?.[gx];

        // 1 = Pared Solida (Siempre colisiona)
        // 2 = Hueco (Colisiona SI NO estas agachado)
        if (tile === 1) return true;
        if (tile === 2 && !agachado) return true;
    }

    return false;
}
