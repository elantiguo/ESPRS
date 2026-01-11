function crearArma() {
    grupoArma = new THREE.Group();
    grupoArma.visible = false; // Oculta por defecto, se muestra al caminar

    // Cargar modelo FBX de pistola
    const loader = new THREE.FBXLoader();
    loader.load('modelos/armas/pistola.fbx', function (object) {
        // Ajustar escala (más grande para primera persona)
        object.scale.set(0.004, 0.004, 0.004);

        // Posicionar en vista de primera persona
        object.position.set(0.4, -0.3, -0.8);

        // Rotar para apuntar hacia adelante
        object.rotation.set(0, Math.PI, 0);

        // Aplicar sombras y eliminar luces embebidas
        const lucesAEliminar = [];
        object.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
            if (child.isLight) {
                lucesAEliminar.push(child);
            }
        });

        // Eliminar luces embebidas del modelo
        lucesAEliminar.forEach(luz => {
            if (luz.parent) luz.parent.remove(luz);
            console.log('Luz embebida eliminada de pistola:', luz.type);
        });

        grupoArma.add(object);
        console.log('Pistola FBX cargada correctamente');
    },
        // Progreso de carga
        function (xhr) {
            if (xhr.total > 0) {
                console.log('Cargando pistola: ' + (xhr.loaded / xhr.total * 100).toFixed(0) + '%');
            }
        },
        // Error
        function (error) {
            console.error('Error cargando pistola FBX:', error);
            crearArmaRespaldo();
        });

    escena.add(grupoArma);
}

// Arma de respaldo si FBX falla
function crearArmaRespaldo() {
    const geoCuerpo = new THREE.BoxGeometry(0.2, 0.3, 0.8);
    const matArma = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1 });
    const cuerpo = new THREE.Mesh(geoCuerpo, matArma);
    cuerpo.position.set(0.4, -0.25, -1.0);
    grupoArma.add(cuerpo);
}

function spawnEntidades() {
    const offset = (DIMENSION * ESCALA) / 2;
    const posInicialX = 1 * ESCALA - offset;
    const posInicialZ = 1 * ESCALA - offset;

    camara.position.set(posInicialX, 2, posInicialZ);

    // Guardar posición inicial del jugador
    posicionJugador.x = posInicialX;
    posicionJugador.y = 2;
    posicionJugador.z = posInicialZ;

    // ========================================
    // CREAR MODELO DEL JUGADOR (TERCERA PERSONA)
    // ========================================
    jugadorObj = new THREE.Group();
    jugadorObj.position.set(posInicialX, 0, posInicialZ);
    jugadorObj.visible = false; // Oculto por defecto (primera persona)

    // Luz azul para el jugador (diferente al bot rojo)
    const luzJugador = new THREE.PointLight(0x00aaff, 1.5, 10);
    luzJugador.position.set(0, 2, 0);
    jugadorObj.add(luzJugador);
    escena.add(jugadorObj);

    // Cargar modelo FBX del jugador (mismo modelo que el bot)
    const fbxLoaderJugador = new THREE.FBXLoader();
    fbxLoaderJugador.load(
        'modelos/personajes/caminar.fbx',
        function (object) {
            jugadorModelo = object;
            object.scale.set(0.0008, 0.0008, 0.0008);
            object.position.set(0, 0, 0);

            // Aplicar sombras, eliminar luces y buscar el arma
            const lucesAEliminar = [];
            object.traverse(function (child) {
                // Log para ver TODOS los objetos del modelo
                console.log('📦 Objeto jugador:', child.name, '| Tipo:', child.type);

                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }

                // Buscar el arma: puede ser Group u Object3D, no solo Mesh
                // Usamos tmpqebahx5v que es el nombre del arma según los logs de animación
                const nombre = child.name.toLowerCase();
                if (nombre.includes('tmpqebahx5v') || nombre.includes('gun') || nombre.includes('weapon')) {
                    jugadorArmaObj = child;
                    child.visible = false;
                    console.log('🔫 ARMA JUGADOR OCULTADA:', child.name, '| Tipo:', child.type);
                }

                if (child.isLight) {
                    lucesAEliminar.push(child);
                }
            });
            lucesAEliminar.forEach(luz => {
                if (luz.parent) luz.parent.remove(luz);
            });

            // Configurar animaciones del jugador
            jugadorMixer = new THREE.AnimationMixer(object);
            jugadorAnimaciones.caminar = [];
            jugadorAnimaciones.parado = [];

            // Guardar animaciones de caminar
            console.log('Jugador - Animaciones de caminar:', object.animations.length);
            for (let i = 0; i < object.animations.length; i++) {
                const anim = object.animations[i];
                console.log('Jugador - Caminar ' + i + ':', anim.name);
                const action = jugadorMixer.clipAction(anim);
                action.setLoop(THREE.LoopRepeat);
                action.timeScale = 1.0;
                jugadorAnimaciones.caminar.push(action);
            }

            jugadorObj.add(object);
            console.log('Modelo del jugador cargado para tercera persona');

            // Cargar animación de parado
            const loaderParado = new THREE.FBXLoader();
            loaderParado.load(
                'modelos/personajes/parado.fbx',
                function (paradoFbx) {
                    console.log('Jugador - Animaciones de parado:', paradoFbx.animations.length);
                    for (let i = 0; i < paradoFbx.animations.length; i++) {
                        const anim = paradoFbx.animations[i];
                        console.log('Jugador - Parado ' + i + ':', anim.name);
                        const action = jugadorMixer.clipAction(anim);
                        action.setLoop(THREE.LoopRepeat);
                        action.timeScale = 1.0;
                        jugadorAnimaciones.parado.push(action);
                    }
                    // Iniciar con animación de parado
                    cambiarAnimacionJugador(false);
                    console.log('Animaciones de parado del jugador cargadas');
                },
                null,
                function (error) {
                    console.warn('No se pudo cargar parado.fbx para jugador:', error);
                    // Si no hay parado, usar caminar por defecto
                    jugadorAnimaciones.caminar.forEach(a => a.play());
                }
            );
        },
        null,
        function (error) {
            console.error('Error cargando modelo del jugador:', error);
            // Crear respaldo (cubo azul)
            const geoJ = new THREE.BoxGeometry(1.2, 3, 1.2);
            const matJ = new THREE.MeshStandardMaterial({ color: 0x0088ff, emissive: 0x001122 });
            const cubo = new THREE.Mesh(geoJ, matJ);
            cubo.position.set(0, 1.5, 0);
            jugadorObj.add(cubo);
        }
    );

    // Crear grupo contenedor para el bot (para posicionamiento)
    botObj = new THREE.Group();
    botObj.position.set((DIMENSION - 2) * ESCALA - offset, 0, (DIMENSION - 2) * ESCALA - offset);

    // Luz del bot
    const luzB = new THREE.PointLight(0xff0000, 2, 12);
    luzB.position.set(0, 2, 0);
    botObj.add(luzB);
    escena.add(botObj);

    // Cargar modelo FBX con animación de caminar
    const fbxLoader = new THREE.FBXLoader();

    fbxLoader.load(
        'modelos/personajes/caminar.fbx',
        function (object) {
            botModelo = object;

            // Ajustar escala del modelo (muy pequeño para que quepa en el laberinto)
            object.scale.set(0.0008, 0.0008, 0.0008);

            // Posicionar el modelo dentro del grupo
            object.position.set(0, 0, 0);

            // Aplicar sombras, eliminar luces y buscar el arma
            const lucesAEliminar = [];
            object.traverse(function (child) {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    // Buscar el arma en el modelo (por nombre con .obj)
                    // NOTA: No usar "arma" porque matchea "Armature"
                    const nombre = child.name.toLowerCase();
                    if (nombre.includes('.obj') || nombre.includes('gun') || nombre.includes('weapon') || nombre.includes('pistol')) {
                        botArmaObj = child;
                        console.log('🔫 Arma del bot encontrada:', child.name);
                    }
                }
                if (child.isLight) {
                    lucesAEliminar.push(child);
                }
            });
            lucesAEliminar.forEach(luz => {
                if (luz.parent) {
                    luz.parent.remove(luz);
                }
                console.log('Luz embebida eliminada del modelo:', luz.type);
            });

            // Configurar AnimationMixer para las animaciones
            botMixer = new THREE.AnimationMixer(object);
            botAnimaciones.caminar = [];
            botAnimaciones.parado = [];

            // Guardar animaciones de caminar
            console.log('Bot - Animaciones de caminar:', object.animations.length);
            for (let i = 0; i < object.animations.length; i++) {
                const anim = object.animations[i];
                console.log('Bot - Caminar ' + i + ':', anim.name);
                const action = botMixer.clipAction(anim);
                action.setLoop(THREE.LoopRepeat);
                action.timeScale = 1.0;
                botAnimaciones.caminar.push(action);
            }

            botObj.add(object);
            console.log('Modelo de personaje del bot cargado correctamente');

            // Cargar animación de parado
            const loaderParadoBot = new THREE.FBXLoader();
            loaderParadoBot.load(
                'modelos/personajes/parado.fbx',
                function (paradoFbx) {
                    console.log('Bot - Animaciones de parado:', paradoFbx.animations.length);
                    for (let i = 0; i < paradoFbx.animations.length; i++) {
                        const anim = paradoFbx.animations[i];
                        console.log('Bot - Parado ' + i + ':', anim.name);
                        const action = botMixer.clipAction(anim);
                        action.setLoop(THREE.LoopRepeat);
                        action.timeScale = 1.0;
                        botAnimaciones.parado.push(action);
                    }
                    // Iniciar con animación de caminar (el bot siempre se mueve)
                    cambiarAnimacionBot(true);
                    console.log('Animaciones de parado del bot cargadas');
                },
                null,
                function (error) {
                    console.warn('No se pudo cargar parado.fbx para bot:', error);
                    // Si no hay parado, usar caminar por defecto
                    botAnimaciones.caminar.forEach(a => a.play());
                }
            );
        },
        // Progreso de carga
        function (xhr) {
            if (xhr.total > 0) {
                console.log('Cargando personaje: ' + (xhr.loaded / xhr.total * 100).toFixed(0) + '%');
            }
        },
        // Error - crear respaldo
        function (error) {
            console.error('Error cargando modelo FBX:', error);
            crearBotRespaldo();
        }
    );
}

// Bot de respaldo si FBX falla (cubo rojo)
function crearBotRespaldo() {
    const geoB = new THREE.BoxGeometry(1.5, 3.5, 1.5);
    const matB = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x220000 });
    const cubo = new THREE.Mesh(geoB, matB);
    cubo.position.set(0, 1.75, 0);
    botObj.add(cubo);
    console.log('Usando bot de respaldo (cubo)');
}

function disparar(quien) {
    if (!activo || cazadorId !== quien) return;

    // Retroceso visual
    if (quien === 1) {
        grupoArma.position.z += 0.25;
        setTimeout(() => { if (grupoArma) grupoArma.position.z -= 0.25; }, 80);
    }

    // Crear Proyectil Sium
    const geoBala = new THREE.SphereGeometry(0.12, 8, 8);
    const matBala = new THREE.MeshBasicMaterial({ color: quien === 1 ? 0xffff00 : 0xff0000 });
    const bala = new THREE.Mesh(geoBala, matBala);

    // Punto de salida
    const dir = new THREE.Vector3();
    if (quien === 1) {
        camara.getWorldDirection(dir);
        bala.position.copy(camara.position).addScaledVector(dir, 1);
    } else {
        dir.subVectors(camara.position, botObj.position).normalize();
        bala.position.copy(botObj.position).addScaledVector(dir, 1.5);
    }

    // Luz de la bala
    const luzBala = new THREE.PointLight(matBala.color, 1.5, 6);
    bala.add(luzBala);

    // Flash de disparo
    const flash = new THREE.PointLight(0xffff00, 3, 10);
    flash.position.copy(bala.position);
    escena.add(flash);
    setTimeout(() => escena.remove(flash), 50);

    proyectilesSium.push({
        mesh: bala,
        dir: dir,
        owner: quien,
        dist: 0
    });
    escena.add(bala);
}

// ========================================
// FUNCIONES PARA CAMBIAR ANIMACIONES
// ========================================

// Cambia la animación del bot entre caminar y parado
function cambiarAnimacionBot(moviendo) {
    if (botMoviendo === moviendo) return; // Sin cambios
    botMoviendo = moviendo;

    const duracionTransicion = 0.3; // segundos

    // Mostrar/ocultar arma del modelo
    if (botArmaObj) {
        botArmaObj.visible = moviendo;
    }

    if (moviendo) {
        // Activar TODAS las animaciones de caminar (cuerpo + arma)
        botAnimaciones.parado.forEach(a => a.fadeOut(duracionTransicion));
        botAnimaciones.caminar.forEach(a => {
            a.reset();
            a.fadeIn(duracionTransicion);
            a.play();
        });
    } else {
        // Activar parado, pero SOLO las del cuerpo (Armature), no el arma
        botAnimaciones.caminar.forEach(a => a.fadeOut(duracionTransicion));
        botAnimaciones.parado.forEach(a => {
            // Solo reproducir animaciones del cuerpo, no del arma
            const nombre = a.getClip().name.toLowerCase();
            if (nombre.includes('object') || nombre.includes('transform')) {
                a.stop(); // Detener animación del arma
            } else {
                a.reset();
                a.fadeIn(duracionTransicion);
                a.play();
            }
        });
    }
}

// Cambia la animación del jugador entre caminar y parado
function cambiarAnimacionJugador(moviendo) {
    if (jugadorMoviendo === moviendo) return; // Sin cambios
    jugadorMoviendo = moviendo;

    const duracionTransicion = 0.3; // segundos

    // Mostrar/ocultar arma del modelo
    if (jugadorArmaObj) {
        jugadorArmaObj.visible = moviendo;
    }

    if (moviendo) {
        // Activar TODAS las animaciones de caminar (cuerpo + arma)
        jugadorAnimaciones.parado.forEach(a => a.fadeOut(duracionTransicion));
        jugadorAnimaciones.caminar.forEach(a => {
            a.reset();
            a.fadeIn(duracionTransicion);
            a.play();
        });
    } else {
        console.log('=== JUGADOR PARÓ - Depurando animaciones ===');

        // DETENER todas las animaciones de caminar primero
        jugadorAnimaciones.caminar.forEach(a => {
            const nombre = a.getClip().name;
            const nombreLower = nombre.toLowerCase();
            // El arma tiene ".obj" en el nombre, NO usar "arma" porque matchea "Armature"
            const esArma = nombreLower.includes('.obj') || nombreLower.includes('gun') || nombreLower.includes('weapon');
            if (esArma) {
                a.stop();
                console.log('❌ CAMINAR DETENIDA (arma):', nombre);
            } else {
                a.fadeOut(duracionTransicion);
                console.log('⏸️ CAMINAR fadeOut (cuerpo):', nombre);
            }
        });

        // Activar parado, pero SOLO las del cuerpo (Armature), no el arma
        jugadorAnimaciones.parado.forEach(a => {
            const nombre = a.getClip().name;
            const nombreLower = nombre.toLowerCase();
            const esArma = nombreLower.includes('.obj') || nombreLower.includes('gun') || nombreLower.includes('weapon');
            if (esArma) {
                a.stop();
                console.log('❌ PARADO DETENIDA (arma):', nombre);
            } else {
                a.reset();
                a.fadeIn(duracionTransicion);
                a.play();
                console.log('✅ PARADO ACTIVADA (cuerpo):', nombre);
            }
        });

        console.log('=== FIN depuración ===');
    }
}

