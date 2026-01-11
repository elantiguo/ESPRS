function generarLaberinto() {
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
    // Convertir algunas paredes (1) en huecos (2) si conectan pasillos
    for (let y = 1; y < DIMENSION - 1; y++) {
        for (let x = 1; x < DIMENSION - 1; x++) {
            if (laberinto[y][x] === 1 && Math.random() < 0.15) { // 15% de probabilidad
                // Verificar si es una pared delgada horizontal o vertical
                const horiz = laberinto[y][x - 1] === 0 && laberinto[y][x + 1] === 0;
                const vert = laberinto[y - 1][x] === 0 && laberinto[y + 1][x] === 0;
                if (horiz || vert) {
                    laberinto[y][x] = 2; // TILE_HOLE
                }
            }
        }
    }

    // --- Carga de Texturas ---
    const loader = new THREE.TextureLoader();
    const texPared = loader.load('texturas/pared.png');
    const texSuelo = loader.load('texturas/suelo.png');

    // Configurar repetición para el suelo
    texSuelo.wrapS = THREE.RepeatWrapping;
    texSuelo.wrapT = THREE.RepeatWrapping;
    texSuelo.repeat.set(DIMENSION, DIMENSION);

    const geoPared = new THREE.BoxGeometry(ESCALA, 7, ESCALA);
    // Color oscuro de respaldo si la textura no carga
    const matPared = new THREE.MeshStandardMaterial({ map: texPared, color: 0x222222, roughness: 0.9 });

    // Geometry for Hanging Wall (Hole)
    // Pared flotante: De Y=3 a Y=7 (Altura 4), dejando hueco abajo de 0 a 3? 
    // Altura agachado ~1.5. Dejemos hueco hasta 1.8. 
    // Pared total 7. Techo en 7.
    // Pared normal: y=3.5 (centro), h=7 -> De 0 a 7.
    // Pared hueco: Queremos hueco de 0 a 1.8. Pared de 1.8 a 7. -> Altura 5.2. Centro = 1.8 + 5.2/2 = 4.4.
    const geoHueco = new THREE.BoxGeometry(ESCALA, 5.2, ESCALA);
    // Pared hueca un poco más oscura para diferenciar
    const matHueco = new THREE.MeshStandardMaterial({ map: texPared, color: 0xbbbbbb, roughness: 0.9 });

    const offset = (DIMENSION * ESCALA) / 2;

    for (let y = 0; y < DIMENSION; y++) {
        for (let x = 0; x < DIMENSION; x++) {
            const val = laberinto[y][x];
            if (val === 1) {
                const muro = new THREE.Mesh(geoPared, matPared);
                muro.position.set(x * ESCALA - offset, 3.5, y * ESCALA - offset);
                muro.castShadow = true;
                muro.receiveShadow = true;
                escena.add(muro);
            } else if (val === 2) {
                const muro = new THREE.Mesh(geoHueco, matHueco);
                muro.position.set(x * ESCALA - offset, 4.4, y * ESCALA - offset);
                muro.castShadow = true;
                muro.receiveShadow = true;
                escena.add(muro);
            }
        }
    }

    const geoSuelo = new THREE.PlaneGeometry(DIMENSION * ESCALA, DIMENSION * ESCALA);
    // Suelo con textura
    const matSuelo = new THREE.MeshStandardMaterial({ map: texSuelo, color: 0x888888, roughness: 0.8 });
    const suelo = new THREE.Mesh(geoSuelo, matSuelo);
    suelo.rotation.x = -Math.PI / 2;
    suelo.receiveShadow = true;
    escena.add(suelo);
}

function colision(nx, nz, agachado = false) {
    const offset = (DIMENSION * ESCALA) / 2;
    const gx = Math.round((nx + offset) / ESCALA);
    const gz = Math.round((nz + offset) / ESCALA);
    const tile = laberinto[gz]?.[gx];

    // 1 = Pared Solida (Siempre colisiona)
    // 2 = Hueco (Colisiona SI NO estas agachado)
    if (tile === 1) return true;
    if (tile === 2) return !agachado;
    return false;
}
