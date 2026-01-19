async function init() {
    escena = new THREE.Scene();
    escena.background = new THREE.Color(0x010101);
    // CB-50: Desactivar fog en móviles (reduce cálculos de fragment shader)
    escena.fog = esDispositivoTactil ? null : new THREE.Fog(0x000000, 5, 45);

    camara = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    renderizador = new THREE.WebGLRenderer({
        antialias: false, // CB-46: Sin antialiasing en TODOS los dispositivos
        powerPreference: 'high-performance', // CB-47: Preferir GPU de alto rendimiento
        stencil: false, // CB-48: Desactivar stencil buffer (no lo usamos)
        depth: true
    });

    // CB-49: Resolución reducida en móviles (75%) para mejor FPS
    const pixelRatio = esDispositivoTactil ? Math.min(window.devicePixelRatio, 1) * 0.75 : Math.min(window.devicePixelRatio, 1.5);
    renderizador.setPixelRatio(pixelRatio);
    renderizador.setSize(window.innerWidth, window.innerHeight);

    // CB-34: Desactivar sombras completamente en móviles para máximo FPS
    renderizador.shadowMap.enabled = !esDispositivoTactil;
    renderizador.shadowMap.type = THREE.BasicShadowMap;

    document.body.appendChild(renderizador.domElement);

    reloj = new THREE.Clock();

    // Inicializar pool de vectores reutilizables
    initVectorPool();

    // Inicializar sistema de colisión de cámara en tercera persona
    _cameraRaycaster = new THREE.Raycaster();
    _cameraRayOrigin = new THREE.Vector3();
    _cameraRayDir = new THREE.Vector3();

    // Detección de dispositivo táctil
    detectarDispositivoTactil();

    // Inicializar sistema de caché avanzado
    inicializarGameCache();

    // Luces ambientales
    // En móviles: Reducida para que la linterna sea visible
    const ambienteIntensidad = esDispositivoTactil ? 0.25 : 0.15;
    const ambiente = new THREE.AmbientLight(0xffffff, ambienteIntensidad);
    escena.add(ambiente);

    // OPT-14: En móviles, agregar luz direccional suave para iluminación base
    if (esDispositivoTactil) {
        const luzDireccional = new THREE.DirectionalLight(0xffffff, 0.15);
        luzDireccional.position.set(5, 10, 5);
        escena.add(luzDireccional);
    }

    // Linterna del jugador
    if (esDispositivoTactil) {
        // Linterna para móviles: SIN SOMBRAS, pero más intensa para que se note
        linterna = new THREE.SpotLight(0xffffcc, 2.5, 25, Math.PI / 4, 0.3, 1);
        linterna.castShadow = false; // Sin sombras en móvil para mejor FPS
        escena.add(linterna);
        escena.add(linterna.target);
    } else {
        // Linterna completa en PC con sombras
        linterna = new THREE.SpotLight(0xffffff, 1.8, 35, Math.PI / 5, 0.4, 1);
        linterna.castShadow = true;
        const shadowSize = 512;
        linterna.shadow.mapSize.width = shadowSize;
        linterna.shadow.mapSize.height = shadowSize;
        linterna.shadow.camera.near = 0.5;
        linterna.shadow.camera.far = 40;
        escena.add(linterna);
        escena.add(linterna.target);
    }

    // Generar laberinto de forma asíncrona (progresiva)
    await generarLaberinto();

    inicializarPathfinder(); // Inicializar A* después de generar laberinto
    inicializarBotTactico(); // Inicializar IA táctica
    spawnEntidades();
    crearArma();
    inicializarProjectilePool(); // Pool de proyectiles para optimización

    // Eventos Sium
    // Eventos Sium
    document.addEventListener('keydown', e => {
        teclas[e.code] = true;

        // Toggle tercera persona con Alt
        if (e.code === 'AltLeft' || e.code === 'AltRight') {
            e.preventDefault(); // Evitar que Alt abra menú del navegador
            toggleTerceraPersona();
        }

        // Saltar con Espacio (si está en el suelo)
        if (e.code === 'Space' && activo && estaEnElSuelo) {
            e.preventDefault();
            if (typeof activarSaltoJugador === 'function') {
                activarSaltoJugador();
            }
        }

        // Resume with Escape
        if (e.code === 'Escape') {
            if (!activo && !juegoTerminado && puedeReanudar) {
                reanudarJuego();
            }
        }
    });
    document.addEventListener('keyup', e => teclas[e.code] = false);
    document.addEventListener('mousemove', manejarMouse);
    document.addEventListener('mousedown', () => { if (activo) disparar(1); });
    window.addEventListener('resize', onResize);

    // Inicializar controles táctiles (Fase 2)
    initControlesTactiles();

    // Cache de elementos UI para optimización
    _domReloj = document.getElementById('reloj');
    _domDistanciaBot = document.getElementById('distancia-bot');
    _domHpTexto = document.getElementById('hp-texto');
    _domBarraVida = document.getElementById('barra-vida-jugador');
    _domFPSCounter = document.getElementById('fps-counter'); // CB-35: FPS Counter

    // Detección de Pausa (Pointer Lock)
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === renderizador.domElement) {
            // Solo activar juego si no estamos en cinematica ni ha terminado
            if (!juegoTerminado && !enCinematica) {
                activo = true;
                ocultarPausa();
                reloj.start();
            }
        } else {
            // Juego Pausado o Terminado
            if (!juegoTerminado) {
                activo = false;
                puedeReanudar = false; // Bloquear reanudacion inmediata
                mostrarPausa();
                reloj.stop();
                // Permitir reanudar despues de un pequeño delay
                setTimeout(() => { puedeReanudar = true; }, 150);
            }
        }
    });
}

function manejarMouse(e) {
    // Permitir mover la cámara (yaw/pitch) si estamos jugando O en cinemática (aunque se ignore el renderizado)
    if ((!activo && !enCinematica) || document.pointerLockElement !== renderizador.domElement) return;
    yaw -= e.movementX * sensiblidad;
    pitch -= e.movementY * sensiblidad;
    pitch = Math.max(-Math.PI / 2.4, Math.min(Math.PI / 2.4, pitch));

    // Solo aplicar rotación directa a la cámara si NO estamos en cinemática
    if (!enCinematica) {
        camara.rotation.set(pitch, yaw, 0, 'YXZ');
    }
}

async function iniciarJuego() {
    // Mostrar pantalla de carga de match
    if (matchLoadingTracker) {
        // 8 assets de modelos + 2 fases de mundo (total 10)
        matchLoadingTracker.start(10);
        matchLoadingTracker.startSafetyTimer(30); // 30s de seguridad para mundo + modelos
        matchLoadingTracker.setStatus("Iniciando arena táctica...");
    }
    document.getElementById('match-loading-screen').classList.remove('hidden');

    // 1 & 2. Cargar Modelos y Generar Mundo en PARALELO para optimizar
    try {
        limpiarMundo(); // Limpiar antes de regenerar

        await Promise.all([
            actualizarModelosPersonajes(),
            generarLaberinto()
        ]);
    } catch (error) {
        console.error("Error durante la carga de la partida:", error);
    }

    // 3. Reinicializar sistemas que dependen del mapa
    inicializarPathfinder();
    inicializarBotTactico();

    // Si el juego ha terminado, reiniciamos la simulación (posiciones, flags, etc.)
    if (juegoTerminado) {
        reiniciarSimulacion();
    } else {
        spawnEntidades();
    }

    // Ocultar menús y mostrar HUD
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('hud-juego').classList.remove('hidden');
    ocultarPausa();

    // 4. Finalizar carga
    if (matchLoadingTracker) matchLoadingTracker.complete();

    // Bloquear puntero INMEDIATAMENTE (requiere gesto del usuario, este botón lo es)
    renderizador.domElement.requestPointerLock();

    // Iniciar fase cinemática
    iniciarCinematica();

    // Detener música de menú
    if (typeof detenerMusicaMenu === 'function') {
        detenerMusicaMenu();
    }
}

function iniciarCinematica() {

    enCinematica = true;
    faseCinematica = 0; // Fase de identificación (10s)
    activo = false;
    tiempoCinematica = 10;

    // Configurar UI
    const pantallaCine = document.getElementById('pantalla-cinematica');
    if (pantallaCine) pantallaCine.classList.remove('hidden');

    // Hacer visibles los personajes para la cámara aérea
    if (jugadorObj) jugadorObj.visible = true;
    if (botObj) botObj.visible = !modoMultijugador; // No mostrar bot en multijugador

    // Reiniciar reloj para la cinemática
    reloj.start();
}

function iniciarRecorridoMapa() {

    faseCinematica = 1; // Fase de movimiento/animación
    tiempoCinematica = 6; // 6 segundos de recorrido

    // Actualizar texto UI si es necesario
    const cineP = document.getElementById('cine-nombre-p');
    if (cineP) cineP.innerText = "EXPLORANDO CAMPO DE BATALLA...";
}

function finalizarCinematica() {

    enCinematica = false;
    activo = true;

    const pantallaCine = document.getElementById('pantalla-cinematica');
    if (pantallaCine) pantallaCine.classList.add('hidden');

    if (jugadorObj) jugadorObj.visible = terceraPersona;

    // Si por alguna razón no está bloqueado (ej: el usuario pulsó algo), intentar bloquear
    if (document.pointerLockElement !== renderizador.domElement) {
        renderizador.domElement.requestPointerLock();
    }

    reloj.start();
    actualizarUI();

    // Mostrar controles táctiles SI es dispositivo táctil (Fase 3) - Después de la animación
    if (esDispositivoTactil) {
        document.getElementById('controles-tactiles').classList.remove('hidden');
    }
}

function reiniciarSimulacion() {


    // 1. Resetear estados de juego
    juegoTerminado = false;
    activo = false;
    tiempo = 30;
    cazadorId = 1;
    vidaJugador = 100;
    if (typeof actualizarHUD === 'function') actualizarHUD();

    // 2. Resetear posiciones (usar lógica de spawnEntidades)
    const offset = (DIMENSION * ESCALA) / 2;
    const posInicialX = 1 * ESCALA - offset;
    const posInicialZ = 1 * ESCALA - offset;

    posicionJugador.x = posInicialX;
    posicionJugador.y = 2;
    posicionJugador.z = posInicialZ;

    camara.position.set(posInicialX, 2, posInicialZ);
    yaw = 0;
    pitch = 0;

    if (jugadorObj) {
        jugadorObj.position.set(posInicialX, 0, posInicialZ);
        if (jugadorMixer) jugadorMixer.stopAllAction();
        cambiarAnimacionJugador(false, false);
    }

    if (botObj) {
        botObj.position.set((DIMENSION - 2) * ESCALA - offset, 0, (DIMENSION - 2) * ESCALA - offset);
        if (botMixer) botMixer.stopAllAction();
        cambiarAnimacionBot(false, false);
        // Resetear IA
        if (botTactico) botTactico.reset();
    }

    // 3. Limpiar proyectiles
    if (projectilePool) projectilePool.clear();

    // 5. Resetear estado de salto
    estaEnElSuelo = true;
    velocidadVertical = 0;
    jugadorSaltando = false;

    // 6. Actualizar UI
    actualizarUI();
    document.getElementById('reloj').innerText = tiempo;
    const titulo = document.getElementById('menu-titulo');
    if (titulo) {
        titulo.innerText = "ESPRS: EVASIÓN TÁCTICA";
        titulo.classList.remove('text-red-500');
    }
    const btnTexto = document.querySelector('button[onclick="iniciarJuego()"] span');
    if (btnTexto) btnTexto.innerText = "INICIAR DUELO";
}

window.reanudarJuego = function () {
    renderizador.domElement.requestPointerLock();
}

var ultimoTiempo = 0;
var animDebugCount = 0;

// ========================================
// CB-35: CONTADOR DE FPS
// ========================================
var _fpsFrameCount = 0;
var _fpsLastTime = 0;
var _fpsDisplay = 0;
var _domFPSCounter = null;

// ========================================
// CB-45: CONTADOR PARA LOD DE ANIMACIONES EN MÓVIL
// ========================================
var _animFrameCounter = 0;

// ========================================
// CB-16: THROTTLE DE RED OPTIMIZADO
// ========================================
var _lastNetworkUpdate = 0;
// OPT-11: Reducir frecuencia de red en móviles (150ms vs 100ms) para ahorrar batería
var _networkThrottleMs = (typeof esDispositivoTactil !== 'undefined' && esDispositivoTactil) ? 150 : 100;
var _lastSentPos = { x: 0, y: 0, z: 0, rotY: 0 };
var _lastSentAnimacion = 'parado'; // Rastrear último estado de animación enviado

var _lastLogicUpdate = 0;       // Último tiempo de actualización de lógica
// CB-46: Tick de IA MUY lento en móviles (3.3Hz vs 10Hz) para reducir carga CPU drásticamente
var _logicTickMs = (typeof esDispositivoTactil !== 'undefined' && esDispositivoTactil) ? 300 : 100;
var _botTargetPos = { x: 0, z: 0 }; // Posición objetivo calculada por la IA
var _botTargetRot = 0;          // Rotación objetivo calculada por la IA
var _botTargetMoviendo = false; // Estado de movimiento objetivo para la IA
var _botTargetAgachado = false; // Estado de agachado objetivo para la IA

// ========================================
// CACHE DE ELEMENTOS DOM (Optimización)
// ========================================
var _domReloj, _domDistanciaBot, _domHpTexto, _domBarraVida;
var _lastActualRelojValue = -1;

// ========================================
// CB-27: OBJETOS REUTILIZABLES PARA IA (Zero-allocation)
// ========================================
var _botPosCache = { x: 0, z: 0 };
var _jugadorPosCache = { x: 0, z: 0 };

// ========================================
// CB-39: VECTOR REUTILIZABLE PARA CÁMARA
// ========================================
var _camaraOffset = { x: 0, y: 0, z: 0 };

// ========================================
// SISTEMA DE COLISIÓN DE CÁMARA (Evitar atravesar paredes)
// ========================================
var _cameraRaycaster = null;   // Raycaster para detectar colisiones
var _cameraRayOrigin = null;   // Origen del rayo (posición del jugador)
var _cameraRayDir = null;      // Dirección del rayo (hacia la cámara)
var _cameraMargin = 0.3;       // Margen de seguridad para no pegar la cámara a la pared

// ========================================
// CB-40: FUNCIÓN GLOBAL PARA INTERPOLAR ÁNGULOS
// ========================================
function shortAngleDist(a0, a1) {
    const max = Math.PI * 2;
    const da = (a1 - a0) % max;
    return 2 * da % max - da;
}

// ========================================
// COLISIÓN DE CÁMARA EN TERCERA PERSONA
// Evita que la cámara atraviese paredes usando Raycaster
// ========================================
var _cameraColisionObjects = [];  // Cache de objetos de colisión
var _cameraColisionCacheValid = false;  // Flag para invalidar cache cuando cambia el nivel

function invalidarCacheColisionCamara() {
    _cameraColisionCacheValid = false;
    _cameraColisionObjects.length = 0;
}

function calcularDistanciaCamaraSegura(jugadorPos, offsetX, offsetY, offsetZ) {
    if (!_cameraRaycaster || !escena) return distanciaCamara;

    // Origen: posición del jugador (ligeramente elevada para evitar colisión con suelo)
    _cameraRayOrigin.set(jugadorPos.x, jugadorPos.y + 0.5, jugadorPos.z);

    // Dirección: desde el jugador hacia la posición deseada de la cámara
    _cameraRayDir.set(
        offsetX - jugadorPos.x,
        offsetY - jugadorPos.y - 0.5,
        offsetZ - jugadorPos.z
    );

    const distanciaDeseada = _cameraRayDir.length();
    if (distanciaDeseada < 0.1) return distanciaCamara;

    _cameraRayDir.normalize();

    // Configurar el raycaster
    _cameraRaycaster.set(_cameraRayOrigin, _cameraRayDir);
    _cameraRaycaster.far = distanciaDeseada + 0.5;

    // Buscar mallas del laberinto para colisión (cacheado)
    if (!_cameraColisionCacheValid) {
        _cameraColisionObjects.length = 0;
        escena.children.forEach(obj => {
            if (obj.name === "mallaLaberinto" || obj.name === "sueloMundo") {
                _cameraColisionObjects.push(obj);
            }
        });
        _cameraColisionCacheValid = true;
    }

    if (_cameraColisionObjects.length === 0) return distanciaDeseada;

    // Hacer el raycast
    const intersecciones = _cameraRaycaster.intersectObjects(_cameraColisionObjects, false);

    if (intersecciones.length > 0) {
        // Hay una pared entre el jugador y la cámara
        const distanciaColision = intersecciones[0].distance;
        // Retornar la distancia de colisión menos un margen de seguridad
        return Math.max(0.5, distanciaColision - _cameraMargin);
    }

    // No hay colisión, usar la distancia deseada
    return distanciaDeseada;
}

// ========================================
// CB-41: CALLBACK REUTILIZABLE PARA COLISIÓN DE PROYECTILES
// ========================================
function _checkProjectileCollision(p) {
    // 1. Colisión con BOT (Single Player / Local)
    if (p.owner === 1) {
        if (botObj) {
            const dx = p.mesh.position.x - botObj.position.x;
            const dz = p.mesh.position.z - botObj.position.z;
            const distSq = dx * dx + dz * dz;
            const h = botAgachado ? 2.5 : 4.5;
            if (distSq < RADIO_BOT_SQ && p.mesh.position.y >= 0 && p.mesh.position.y <= h) {
                if (!modoMultijugador) finalizar("¡HAS GANADO!");
                return true;
            }
        }

        // 2. Colisión con JUGADORES REMOTOS (Multijugador)
        if (modoMultijugador && typeof jugadoresRemotos !== 'undefined') {
            let hitId = null;
            jugadoresRemotos.forEach((jugador, id) => {
                const dx = p.mesh.position.x - jugador.contenedor.position.x;
                const dz = p.mesh.position.z - jugador.contenedor.position.z;
                const distSq = dx * dx + dz * dz;
                const h = jugador.animacionActual === 'agachado' ? 2.5 : 4.5;
                if (distSq < 0.64 && p.mesh.position.y >= 0 && p.mesh.position.y <= h) {
                    hitId = id;
                }
            });

            if (hitId) {
                if (typeof enviarImpacto === 'function') {
                    enviarImpacto(hitId, 20);
                }
                return true;
            }
        }
    } else if (p.owner === 2) {
        // Bala del bot local contra jugador local
        const dx = p.mesh.position.x - posicionJugador.x;
        const dz = p.mesh.position.z - posicionJugador.z;
        const distSq = dx * dx + dz * dz;
        // Verificar estado de agachado del jugador usando teclas
        const jugadorAgachado = teclas['ShiftLeft'] || teclas['ShiftRight'] || teclas['KeyC'];
        const h = jugadorAgachado ? 2.5 : 4.5;
        if (distSq < RADIO_JUGADOR_SQ && p.mesh.position.y >= 0 && p.mesh.position.y <= h) {
            finalizar("BOT TE ELIMINÓ");
            return true;
        }
    }
    return false;
}

// ========================================
// POOL DE VECTORES REUTILIZABLES (Optimización)
// ========================================

function obtenerTileEnPos(x, z) {
    const offset = (DIMENSION * ESCALA) / 2;
    const gx = Math.round((x + offset) / ESCALA);
    const gz = Math.round((z + offset) / ESCALA);
    return laberinto[gz]?.[gx];
}

// CB-71: Variables para frame rate limiting en móviles
var _lastFrameTime = 0;
var _targetFrameTime = esDispositivoTactil ? 33.33 : 0; // 30 FPS en móvil, sin límite en PC

function bucle(tiempo) {
    requestAnimationFrame(bucle);

    // Manejar primer frame donde tiempo puede ser undefined
    if (!tiempo) tiempo = 0;

    // CB-71: Frame rate limiter para móviles - Skip frame si es muy pronto
    if (esDispositivoTactil && _targetFrameTime > 0) {
        const elapsed = tiempo - _lastFrameTime;
        if (elapsed < _targetFrameTime) {
            return; // Skip this frame
        }
    }
    _lastFrameTime = tiempo;

    // Calcular delta time real para animaciones
    const dtReal = ultimoTiempo > 0 ? (tiempo - ultimoTiempo) / 1000 : 0.016;
    ultimoTiempo = tiempo;

    // CB-22: Cap dt para evitar saltos masivos y clipping por lag
    // CB-72: Cap más estricto en móviles para evitar saltos
    let dt = reloj.getDelta();
    const maxDt = esDispositivoTactil ? 0.05 : 0.1;
    if (dt > maxDt) {
        dt = maxDt;
    }

    // CB-35: Actualizar contador de FPS (cada segundo)
    _fpsFrameCount++;
    if (tiempo - _fpsLastTime >= 1000) {
        _fpsDisplay = _fpsFrameCount;
        _fpsFrameCount = 0;
        _fpsLastTime = tiempo;
        if (_domFPSCounter && (activo || enCinematica)) {
            _domFPSCounter.textContent = `FPS: ${_fpsDisplay}`;
            _domFPSCounter.classList.remove('hidden');
        }
    }
    // Ocultar contador cuando no está en partida
    if (_domFPSCounter && !activo && !enCinematica) {
        _domFPSCounter.classList.add('hidden');
    }


    // ========================================
    // LÓGICA DE CINEMÁTICA (PRE-JUEGO)
    // ========================================
    if (enCinematica) {
        tiempoCinematica -= dt;

        if (faseCinematica === 0) {
            // FASE 0: CUENTA ATRÁS (Cámara Estática / Identificación)
            const seg = Math.max(0, Math.ceil(tiempoCinematica));
            document.getElementById('contador-cinematica').innerText = seg;

            if (tiempoCinematica > 5) {
                // Primeros 5 segundos: Identificar Jugador
                const target = posicionJugador;
                // Posición fija de cámara para ver al jugador de frente
                camara.position.set(target.x + 4, 3, target.z + 4);
                camara.lookAt(target.x, 1.5, target.z);

                const pNombre = personajesSium[idPersonajeSeleccionado].nombre;
                document.getElementById('cine-nombre-p').innerText = `IDENTIFICANDO: ${pNombre}`;
                document.getElementById('cine-nombre-b').innerText = modoMultijugador ? `BUSCANDO RIVAL...` : `ESTADO: EN ESPERA`;
            } else {
                // Siguientes 5 segundos: Identificar Bot o Rival
                let targetPos = botObj.position;
                // Usar nombre del personaje del bot seleccionado aleatoriamente
                let targetNombre = idPersonajeBot ? (personajesSium[idPersonajeBot]?.nombre || "BOT").toUpperCase() : "BOT";

                if (modoMultijugador && typeof jugadoresRemotos !== 'undefined' && jugadoresRemotos.size > 0) {
                    const rival = jugadoresRemotos.values().next().value;
                    if (rival && rival.contenedor) {
                        targetPos = rival.contenedor.position;
                        targetNombre = (personajesSium[rival.personaje]?.nombre || "RIVAL").toUpperCase();
                    }
                }

                // Posición fija de cámara para ver al objetivo
                camara.position.set(targetPos.x - 4, 3, targetPos.z - 4);
                camara.lookAt(targetPos.x, 1.5, targetPos.z);

                document.getElementById('cine-nombre-p').innerText = modoMultijugador ? `RIVAL LOCALIZADO` : `OBJETIVO LOCALIZADO`;
                document.getElementById('cine-nombre-b').innerText = `AMENAZA: ${targetNombre}`;
            }

            if (tiempoCinematica <= 0) {
                iniciarRecorridoMapa();
            }
        } else if (faseCinematica === 1) {
            // FASE 1: ANIMACIÓN / RECORRIDO MAPA (Inicia después del contador)
            document.getElementById('contador-cinematica').innerText = "LIVE";

            const progreso = 1 - (tiempoCinematica / 6); // De 0 a 1 en 6 segundos
            const tiempoAnim = (1 - progreso) * 2;

            // Recorrido dinámico por el cielo del laberinto
            const centroX = 0;
            const centroZ = 0;
            const radio = 30 - progreso * 15;

            camara.position.x = centroX + Math.cos(tiempoAnim) * radio;
            camara.position.z = centroZ + Math.sin(tiempoAnim) * radio;
            camara.position.y = 8 + progreso * 20;

            camara.lookAt(centroX, 2, centroZ);

            if (tiempoCinematica <= 0) {
                finalizarCinematica();
            }
        }
    }

    // CB-04: ACTUALIZAR ANIMACIONES SOLO SI ACTIVO O EN CINEMÁTICA
    // ========================================
    // CB-50: En móviles, actualizar animaciones cada 3 frames para reducir carga CPU (más agresivo)
    _animFrameCounter++;
    const animSkipFrames = esDispositivoTactil ? 3 : 1;
    const shouldUpdateAnims = (_animFrameCounter % animSkipFrames === 0);

    if (activo || enCinematica) {
        // CB-51: Ocultar bot si está muy lejos en móviles (ahorra renderizado)
        if (botObj && esDispositivoTactil) {
            const _dxBot = botObj.position.x - camara.position.x;
            const _dzBot = botObj.position.z - camara.position.z;
            const distBotSq = _dxBot * _dxBot + _dzBot * _dzBot;
            botObj.visible = !modoMultijugador && distBotSq < 400; // 20m
        }

        // Optimización Sium: Mixers de personajes locales
        if (botMixer && shouldUpdateAnims && botObj.visible) {
            // CB-32: LOD de animación más agresivo en móviles (10m en vez de 25m)
            const _dxBot = botObj.position.x - camara.position.x;
            const _dzBot = botObj.position.z - camara.position.z;
            const distBotSq = _dxBot * _dxBot + _dzBot * _dzBot;
            const lodDistSq = esDispositivoTactil ? 100 : 625; // 10m vs 25m
            if (distBotSq < lodDistSq) {
                // Compensar frames saltados multiplicando dtReal
                botMixer.update(dtReal * animSkipFrames);
            }
        }

        if (jugadorMixer && shouldUpdateAnims) {
            // Compensar frames saltados
            jugadorMixer.update(dtReal * animSkipFrames);
        }
    }

    if (activo) {
        // --- LÓGICA DE AGACHARSE (CROUCH) ---
        let quiereAgacharse = teclas['ShiftLeft'] || teclas['ShiftRight'] || teclas['KeyC'];

        // Verificar si estamos bajo un hueco (Tile 2)
        let bajoHueco = false;
        const offset = (DIMENSION * ESCALA) / 2;

        // CB-20: Optimización - Evitar creación de arrays/objetos cada frame
        // FIX: Usar el RADIO_JUGADOR completo para detectar huecos, no solo 0.5
        // Esto evita que el jugador se quede atascado al salir del hueco,
        // ya que la detección de hueco coincide con el radio de colisión
        const rHueco = RADIO_JUGADOR;

        // Verificar centro
        if (obtenerTileEnPos(posicionJugador.x, posicionJugador.z) === 2) {
            bajoHueco = true;
        } else {
            // Verificar en cruz (4 puntos cardinales) con radio completo
            if (obtenerTileEnPos(posicionJugador.x + rHueco, posicionJugador.z) === 2 ||
                obtenerTileEnPos(posicionJugador.x - rHueco, posicionJugador.z) === 2 ||
                obtenerTileEnPos(posicionJugador.x, posicionJugador.z + rHueco) === 2 ||
                obtenerTileEnPos(posicionJugador.x, posicionJugador.z - rHueco) === 2) {
                bajoHueco = true;
            }
        }

        if (bajoHueco) {
            quiereAgacharse = true; // Forzar agachado
        }

        const agachado = quiereAgacharse;
        const alturaObjetivo = agachado ? 1.4 : 2.4;

        // Ajuste de velocidad
        const multiplicadorVel = agachado ? 3.5 : 7;
        const vel = multiplicadorVel * dt;

        // Calcular dirección de movimiento basándose en yaw (Unificado: W es siempre hacia -Z si yaw=0)
        _vecForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        _vecForward.normalize();

        _vecRight.set(0, 1, 0);
        _vecRight.crossVectors(_vecForward, _vecRight).negate();

        // Usar posicionJugador como base, no camara.position
        _vecNextPos.set(posicionJugador.x, posicionJugador.y, posicionJugador.z);
        let moviendo = false;

        // Controles: A=Derecha, D=Izquierda (Solicitados por usuario)
        let moviendoAdelante = false;
        let moviendoLateral = 0; // -1=izquierda, 0=nada, 1=derecha

        // Acumular dirección de movimiento (sin aplicar velocidad aún)
        let movX = 0, movZ = 0;

        if (teclas['KeyW']) { movX += _vecForward.x; movZ += _vecForward.z; moviendo = true; moviendoAdelante = true; }
        if (teclas['KeyS']) { movX -= _vecForward.x; movZ -= _vecForward.z; moviendo = true; moviendoAdelante = true; }
        if (teclas['KeyA']) { movX += _vecRight.x; movZ += _vecRight.z; moviendo = true; moviendoLateral = 1; }
        if (teclas['KeyD']) { movX -= _vecRight.x; movZ -= _vecRight.z; moviendo = true; moviendoLateral = -1; }

        // Joystick (Fase 2)
        if (joystickVector.x !== 0 || joystickVector.y !== 0) {
            movX += _vecForward.x * joystickVector.y - _vecRight.x * joystickVector.x;
            movZ += _vecForward.z * joystickVector.y - _vecRight.z * joystickVector.x;
            moviendo = true;
            if (Math.abs(joystickVector.y) > 0.3) moviendoAdelante = true;
            if (Math.abs(joystickVector.x) > 0.5 && !moviendoAdelante) {
                moviendoLateral = joystickVector.x > 0 ? -1 : 1;
            }
        }

        // Normalizar vector de movimiento para evitar que diagonal sea más rápido
        if (moviendo) {
            const movMag = Math.sqrt(movX * movX + movZ * movZ);
            if (movMag > 0) {
                movX /= movMag;
                movZ /= movMag;
            }
            // Aplicar velocidad normalizada
            _vecNextPos.x += movX * vel;
            _vecNextPos.z += movZ * vel;
        }

        // Activar/desactivar animación de strafe (solo en tercera persona)
        // Se activa cuando hay movimiento lateral (A/D), incluso combinado con W/S
        if (terceraPersona && typeof activarStrafeJugador === 'function') {
            if (moviendoLateral !== 0 && !agachado) {
                activarStrafeJugador(moviendoLateral);
            } else if (jugadorStrafing) {
                activarStrafeJugador(0); // Desactivar strafe
            }
        }

        // Pasamos estado 'agachado' a la colisión con RADIO_JUGADOR
        // Mover X independiente (permite deslizarse por paredes)
        if (!colision(_vecNextPos.x, posicionJugador.z, agachado, RADIO_JUGADOR)) {
            posicionJugador.x = _vecNextPos.x;
        }
        if (!colision(posicionJugador.x, _vecNextPos.z, agachado, RADIO_JUGADOR)) {
            posicionJugador.z = _vecNextPos.z;
        }

        // --- LÓGICA DE SALTO Y GRAVEDAD ---
        if (!estaEnElSuelo) {
            // Aplicar gravedad
            velocidadVertical -= GRAVEDAD * dt;
            posicionJugador.y += velocidadVertical * dt;

            // Verificar aterrizaje
            if (posicionJugador.y <= alturaObjetivo) {
                posicionJugador.y = alturaObjetivo;
                velocidadVertical = 0;
                estaEnElSuelo = true;
            }
        } else {
            // Si está en el suelo, seguir suavemente la altura objetivo (crouch/stand)
            // pero permitir que el salto lo eleve
            posicionJugador.y = alturaObjetivo;
        }

        // ========================================
        // SINCRONIZACIÓN DE RED (enviar posición)
        // ========================================
        if (modoMultijugador && estaConectado()) {
            const ahora = Date.now();
            // Throttle: enviar solo cada _networkThrottleMs
            if (ahora - _lastNetworkUpdate > _networkThrottleMs) {
                const estadoAnimacion = agachado ? 'agachado' : (moviendo ? 'caminar' : 'parado');

                // Detectar cambios significativos
                const dx = Math.abs(posicionJugador.x - _lastSentPos.x);
                const dz = Math.abs(posicionJugador.z - _lastSentPos.z);
                const dRot = Math.abs(yaw - _lastSentPos.rotY);
                const cambioAnimacion = estadoAnimacion !== _lastSentAnimacion;

                // Solo considerar cambio de rotación si el jugador se está moviendo o disparando
                // Si está quieto (parado), puede mirar alrededor sin rotar el modelo para otros
                const cambioRotacionRelevante = (moviendo || jugadorDisparando) && dRot > 0.05;

                // Enviar actualización si cambió posición (>0.05), animación, o rotación (>0.05)
                if (dx > 0.05 || dz > 0.05 || cambioRotacionRelevante || cambioAnimacion) {
                    // Calcular rotación real del modelo para enviar
                    // IMPORTANTE: En primera persona, el yaw está invertido (+Math.PI) por el sistema de cámara,
                    // pero el modelo debe aparecer correctamente orientado para otros jugadores
                    let rotEnvio = _lastSentPos.rotY; // Por defecto, mantener última rotación enviada

                    if (terceraPersona) {
                        // En tercera persona, aplicar compensación según estado
                        if (jugadorDisparando) {
                            // Cuando dispara, usar yaw - Math.PI para compensar inversión
                            rotEnvio = yaw - Math.PI;
                        } else if (moviendo) {
                            // Cuando se mueve sin disparar, usar dirección de movimiento
                            rotEnvio = Math.atan2(_vecForward.x, _vecForward.z);
                        } else {
                            // Cuando está quieto, mantener última rotación enviada
                            rotEnvio = _lastSentPos.rotY;
                        }
                    } else {
                        // En primera persona
                        if (moviendo || jugadorDisparando) {
                            // Solo actualizar rotación si se mueve o dispara
                            rotEnvio = yaw - Math.PI;
                        } else {
                            // Quieto: mantener última rotación enviada
                            rotEnvio = _lastSentPos.rotY;
                        }
                    }

                    enviarPosicion(posicionJugador.x, posicionJugador.y, posicionJugador.z, rotEnvio, estadoAnimacion);

                    _lastSentPos.x = posicionJugador.x;
                    _lastSentPos.y = posicionJugador.y;
                    _lastSentPos.z = posicionJugador.z;
                    _lastSentPos.rotY = rotEnvio; // Guardar rotación enviada, no el yaw de cámara
                    _lastSentAnimacion = estadoAnimacion; // Actualizar última animación enviada
                }
                _lastNetworkUpdate = ahora;
            }
        }

        // ========================================
        // SISTEMA DE CÁMARA PRIMERA/TERCERA PERSONA
        // ========================================
        if (terceraPersona) {
            // TERCERA PERSONA: Cámara detrás del jugador

            // Actualizar posición del modelo del jugador
            if (jugadorObj) {
                jugadorObj.position.x = posicionJugador.x;
                jugadorObj.position.z = posicionJugador.z;

                // Cambiar animación según movimiento y agachado
                // (No cambiar si está en strafe para evitar conflictos)
                if (!jugadorStrafing) {
                    cambiarAnimacionJugador(moviendo, agachado);
                }

                // Rotar modelo hacia la dirección de movimiento O hacia el frente si dispara
                if (jugadorDisparando) {
                    // Restar Math.PI porque en tercera persona el yaw está invertido
                    jugadorObj.rotation.y = yaw - Math.PI;
                } else if (moviendo) {
                    const anguloJugador = Math.atan2(_vecForward.x, _vecForward.z);
                    jugadorObj.rotation.y = anguloJugador;
                }

                // FORZAR escala fija del modelo (la animación FBX tiene keyframes de escala)
                if (jugadorModelo) {
                    const escalaY = agachado ? ESCALA_AGACHADO : ESCALA_PERSONAJE;
                    jugadorModelo.scale.set(ESCALA_PERSONAJE, escalaY, ESCALA_PERSONAJE);
                }

                // SUAVIZAR rotación del modelo (evita saltos al cambiar animación)
                if (jugadorContenedor) {
                    let targetX, targetY, targetZ;

                    if (agachado) {
                        targetX = agachadoRotacionX;
                        targetY = agachadoRotacionY;
                        targetZ = agachadoRotacionZ;
                    } else if (moviendo) {
                        targetX = caminarRotacionX;
                        targetY = caminarRotacionY;
                        targetZ = caminarRotacionZ;
                    } else {
                        targetX = paradoRotacionX;
                        targetY = paradoRotacionY;
                        targetZ = paradoRotacionZ;
                    }

                    // CB-40: Usar función global en lugar de crear una cada frame
                    // Interpolar rotación suavemente (10 * dt es ~0.3s)
                    jugadorContenedor.rotation.x += shortAngleDist(jugadorContenedor.rotation.x, targetX) * 10 * dt;
                    jugadorContenedor.rotation.y += shortAngleDist(jugadorContenedor.rotation.y, targetY) * 10 * dt;
                    jugadorContenedor.rotation.z += shortAngleDist(jugadorContenedor.rotation.z, targetZ) * 10 * dt;
                }
            }

            // Posicionar cámara detrás del jugador usando pitch para altura
            // Unificado: Cámara se posiciona en el lado opuesto al vector forward del jugador
            const alturaExtra = -pitch * 3;
            const distanciaExtra = Math.cos(pitch) * distanciaCamara;

            // CB-39: Reutilizar objeto en lugar de crear Vector3 cada frame
            // Calcular posición DESEADA de la cámara (antes de colisión)
            // Invertimos el signo de sin/cos respecto a primera persona para estar detrás
            _camaraOffset.x = posicionJugador.x + Math.sin(yaw) * distanciaExtra;
            _camaraOffset.z = posicionJugador.z + Math.cos(yaw) * distanciaExtra;
            _camaraOffset.y = posicionJugador.y + alturaCamara + alturaExtra;

            // COLISIÓN DE CÁMARA: Verificar si hay paredes entre jugador y cámara
            const distanciaSegura = calcularDistanciaCamaraSegura(
                posicionJugador,
                _camaraOffset.x,
                _camaraOffset.y,
                _camaraOffset.z
            );

            // Si hay colisión, recalcular posición de cámara más cerca del jugador
            const distanciaDeseada = Math.sqrt(
                Math.pow(_camaraOffset.x - posicionJugador.x, 2) +
                Math.pow(_camaraOffset.y - posicionJugador.y, 2) +
                Math.pow(_camaraOffset.z - posicionJugador.z, 2)
            );

            if (distanciaSegura < distanciaDeseada) {
                // Ajustar la posición de la cámara proporcionalmente
                const factor = distanciaSegura / distanciaDeseada;
                _camaraOffset.x = posicionJugador.x + (Math.sin(yaw) * distanciaExtra) * factor;
                _camaraOffset.z = posicionJugador.z + (Math.cos(yaw) * distanciaExtra) * factor;
                _camaraOffset.y = posicionJugador.y + (alturaCamara + alturaExtra) * factor + 1; // +1 para mantener algo de altura
            }

            // Suavizar movimiento de cámara
            camara.position.x += (_camaraOffset.x - camara.position.x) * 8 * dt;
            camara.position.y += (_camaraOffset.y - camara.position.y) * 8 * dt;
            camara.position.z += (_camaraOffset.z - camara.position.z) * 8 * dt;

            // Cámara mira hacia el jugador
            camara.lookAt(posicionJugador.x, posicionJugador.y + 1, posicionJugador.z);

        } else {
            // PRIMERA PERSONA: Cámara en posición del jugador
            camara.position.x = posicionJugador.x;
            camara.position.z = posicionJugador.z;

            if (estaEnElSuelo) {
                // Suavizado suave para agacharse/levantarse
                camara.position.y += (posicionJugador.y - camara.position.y) * 10 * dt;
            } else {
                // Durante el salto, seguimiento directo para evitar latencia visual
                camara.position.y = posicionJugador.y;
            }
            camara.rotation.set(pitch, yaw, 0, 'YXZ');
        }

        // Actualizar Brazo Sium (solo visible en primera persona Y moviendo O disparando)
        if (!terceraPersona) {
            // Mostrar arma cuando se mueve O cuando dispara
            grupoArma.visible = moviendo || jugadorDisparando;

            grupoArma.position.copy(camara.position);
            grupoArma.rotation.copy(camara.rotation);

            if (moviendo) {
                balanceoArma += dt * (agachado ? 8 : 12);
                grupoArma.position.y += Math.sin(balanceoArma) * 0.02;
                grupoArma.position.x += Math.cos(balanceoArma * 0.6) * 0.01;
            }
        } else {
            grupoArma.visible = false; // Ocultar en tercera persona
        }

        // Actualizar Linterna Sium (sigue al jugador y apunta hacia donde mira)
        linterna.position.set(posicionJugador.x, posicionJugador.y, posicionJugador.z);

        // Calcular dirección según modo de cámara
        // En ambos modos, la linterna debe seguir la dirección de la mirada (yaw y pitch)
        const dirX = -Math.sin(yaw) * Math.cos(pitch);
        const dirZ = -Math.cos(yaw) * Math.cos(pitch);
        const dirY = Math.sin(pitch);

        _vecTarget.set(
            posicionJugador.x + dirX * 10,
            posicionJugador.y + dirY * 10,
            posicionJugador.z + dirZ * 10
        );
        linterna.target.position.copy(_vecTarget);

        // --- LÓGICA DE PROYECTILES SIUM (POOLED) ---
        // CB-41: Usar función global en lugar de crear callback cada frame
        if (projectilePool) {
            projectilePool.update(dt, _checkProjectileCollision);
        }

        // ============================================
        // IA TÁCTICA CON MOVIMIENTO POR TICKS (Fase 1)
        // ============================================
        if (!modoMultijugador && botObj) {
            const ahora = Date.now();
            // CB-27: Reutilizar objetos en lugar de crearlos cada frame
            _botPosCache.x = botObj.position.x;
            _botPosCache.z = botObj.position.z;
            _jugadorPosCache.x = posicionJugador.x;
            _jugadorPosCache.z = posicionJugador.z;
            const esCazador = cazadorId === 2;

            // --- BLOQUE DE TICKS DE LÓGICA (10Hz) ---
            if (ahora - _lastLogicUpdate > _logicTickMs) {
                // CB-61: Calcular distancia manualmente para evitar allocations de distanceTo()
                const _dxBotDist = botObj.position.x - posicionJugador.x;
                const _dyBotDist = botObj.position.y - posicionJugador.y;
                const _dzBotDist = botObj.position.z - posicionJugador.z;
                const distBot = Math.sqrt(_dxBotDist * _dxBotDist + _dyBotDist * _dyBotDist + _dzBotDist * _dzBotDist);

                // 1. Verificar línea de visión
                const vision = botTactico.tieneLineaDeVision(
                    _botPosCache, _jugadorPosCache, laberinto, DIMENSION, ESCALA
                );

                // 2. Actualizar estado del bot y memoria
                botTactico.actualizarEstado(
                    _botPosCache, _jugadorPosCache, esCazador, vision.visible, distBot, _logicTickMs / 1000, laberinto, DIMENSION, ESCALA
                );

                // 3. Sistema de disparo inteligente
                if (esCazador && botTactico.puedeDisparar(_logicTickMs / 1000)) {
                    if (botTactico.intentarDisparar(distBot, vision.visible)) {
                        disparar(2);
                    }
                }

                // 4. Calcular OBJETIVO de movimiento
                const objetivoBot = botTactico.obtenerObjetivo(_botPosCache, _jugadorPosCache, esCazador, _logicTickMs / 1000);
                const siguientePunto = pathfinder.obtenerSiguientePunto(_botPosCache, objetivoBot);
                const botDebeAgacharse = botTactico.debeAgacharse(_botPosCache, laberinto, DIMENSION, ESCALA, siguientePunto);
                _botTargetAgachado = botDebeAgacharse; // Guardar estado objetivo para el frame loop

                let dirBotRaw;
                if (siguientePunto) {
                    dirBotRaw = { x: siguientePunto.x - _botPosCache.x, z: siguientePunto.z - _botPosCache.z };
                } else {
                    dirBotRaw = { x: objetivoBot.x - _botPosCache.x, z: objetivoBot.z - _botPosCache.z };
                }

                const distMov = Math.sqrt(dirBotRaw.x * dirBotRaw.x + dirBotRaw.z * dirBotRaw.z);

                if (distMov > 0.1) {
                    const dirNormX = dirBotRaw.x / distMov;
                    const dirNormZ = dirBotRaw.z / distMov;
                    const dirSuave = botTactico.suavizarDireccion(dirNormX, dirNormZ, _logicTickMs / 1000);
                    const proyectilesActivos = (projectilePool) ? projectilePool.getActive() : [];
                    botTactico.intentarEsquivar(_botPosCache, proyectilesActivos, _logicTickMs / 1000);
                    const esquive = botTactico.obtenerModificadorEsquive();

                    let dirFinalX = dirSuave.x;
                    let dirFinalZ = dirSuave.z;

                    if (esquive.activo) {
                        dirFinalX = dirSuave.x * 0.3 + esquive.x * 0.7;
                        dirFinalZ = dirSuave.z * 0.3 + esquive.z * 0.7;
                        const magFinal = Math.sqrt(dirFinalX * dirFinalX + dirFinalZ * dirFinalZ);
                        if (magFinal > 0) {
                            dirFinalX /= magFinal;
                            dirFinalZ /= magFinal;
                        }
                    }

                    _botTargetPos.x = dirFinalX;
                    _botTargetPos.z = dirFinalZ;
                    _botTargetRot = Math.atan2(dirFinalX, dirFinalZ);
                    _botTargetMoviendo = true;
                } else {
                    _botTargetMoviendo = false;
                }

                // Actualizar textos de HUD cada tick
                if (_domDistanciaBot) {
                    _domDistanciaBot.innerText = `${distBot.toFixed(1)}m ${botTactico.getEstadoTexto()}`;
                }

                _lastLogicUpdate = ahora;
            }

            // --- APLICACIÓN DE MOVIMIENTO SUAVE (En cada frame) ---
            if (botMoviendo) {
                const velocidadBase = 7 * dt;
                // CB-56: Pasar timestamp para evitar Date.now() adicional
                let velocidadBot = botTactico.obtenerVelocidad(velocidadBase, ahora);

                // Aplicar bono de esquive si está esquivando (aunque el cálculo sea por ticks)
                const esquive = botTactico.obtenerModificadorEsquive();
                if (esquive.activo) velocidadBot *= 2.0;

                const nX = botObj.position.x + _botTargetPos.x * velocidadBot;
                const nZ = botObj.position.z + _botTargetPos.z * velocidadBot;

                if (!colision(nX, botObj.position.z, botAgachado, RADIO_BOT)) botObj.position.x = nX;
                if (!colision(botObj.position.x, nZ, botAgachado, RADIO_BOT)) botObj.position.z = nZ;

                // Suavizar rotación del bot (LERP)
                const a0 = botObj.rotation.y;
                const a1 = _botTargetRot;
                const distR = ((a1 - a0 + Math.PI) % (Math.PI * 2)) - Math.PI;
                botObj.rotation.y += distR * 10 * dt;
            }

            // Actualizar visuales (Agachado/Escala) siempre
            // LLamar a cambiarAnimacionBot con los valores objetivo. 
            // La función se encarga de detectar si hubo cambio respecto a botAgachado/botMoviendo actuales.
            cambiarAnimacionBot(_botTargetMoviendo, _botTargetAgachado);

            // Sincronizar estados visuales para el resto del frame loop (colisiones, escala, etc.)
            // IMPORTANTE: Esto debe ir DESPUÉS de cambiarAnimacionBot para que la función detecte el cambio.
            botAgachado = _botTargetAgachado;
            botMoviendo = _botTargetMoviendo;

            if (botModelo) {
                const escalaY = botAgachado ? ESCALA_AGACHADO : ESCALA_PERSONAJE;
                botModelo.scale.y += (escalaY - botModelo.scale.y) * 10 * dt;
                botModelo.scale.x = ESCALA_PERSONAJE;
                botModelo.scale.z = ESCALA_PERSONAJE;
            }

            if (botContenedor) {
                let targetX = botAgachado ? agachadoRotacionX : (botMoviendo ? caminarRotacionX : paradoRotacionX);
                let targetY = botAgachado ? agachadoRotacionY : (botMoviendo ? caminarRotacionY : paradoRotacionY);
                let targetZ = botAgachado ? agachadoRotacionZ : (botMoviendo ? caminarRotacionZ : paradoRotacionZ);
                botContenedor.rotation.x += (targetX - botContenedor.rotation.x) * 10 * dt;
                botContenedor.rotation.y += (targetY - botContenedor.rotation.y) * 10 * dt;
                botContenedor.rotation.z += (targetZ - botContenedor.rotation.z) * 10 * dt;
            }
        } else if (modoMultijugador) {
            // MODO MULTIJUGADOR: Actualizar distancia al oponente más cercano
            if (typeof jugadoresRemotos !== 'undefined' && jugadoresRemotos.size > 0) {
                let minDist = 999;
                jugadoresRemotos.forEach(j => {
                    // CB-61: Cálculo manual de distancia para evitar allocations
                    const _drx = j.contenedor.position.x - posicionJugador.x;
                    const _drz = j.contenedor.position.z - posicionJugador.z;
                    const d = Math.sqrt(_drx * _drx + _drz * _drz);
                    if (d < minDist) minDist = d;
                });
                if (_domDistanciaBot) _domDistanciaBot.innerText = `${minDist.toFixed(1)}m RIVAL`;
            } else {
                if (_domDistanciaBot) _domDistanciaBot.innerText = `BUSCANDO...`;
            }
        }

        // Temporizador de roles
        tiempo -= dt;
        if (tiempo <= 0) {
            tiempo = 30;
            cazadorId = cazadorId === 1 ? 2 : 1;
            actualizarUI();
        }

        // Throttle de UI: solo actualizar si el valor cambió
        const relojActual = Math.ceil(tiempo);
        if (relojActual !== _lastRelojValue) {
            _lastRelojValue = relojActual;
            if (_domReloj) _domReloj.innerText = relojActual;
        }
    }

    // ========================================
    // OCULTAR ARMA EN TERCERA PERSONA (siempre)
    // ========================================
    if (grupoArma && terceraPersona) {
        grupoArma.visible = false;
    }

    // ========================================
    // ACTUALIZAR JUGADORES REMOTOS (interpolación)
    // ========================================
    if (modoMultijugador && typeof actualizarJugadoresRemotos === 'function') {
        actualizarJugadoresRemotos(dt > 0 ? dt : 0.016);
    }

    renderizador.render(escena, camara);
}

// ========================================
// SISTEMA DE CONTROLES TÁCTILES (Fase 2)
// ========================================
function detectarDispositivoTactil() {
    // Solo registrar si es táctil, la visibilidad se maneja en iniciarJuego
    return esDispositivoTactil;
}

function initControlesTactiles() {
    const container = document.getElementById('joystick-container');
    const base = document.getElementById('joystick-base');
    const palanca = document.getElementById('joystick-palanca');

    if (!container || !base || !palanca) return;

    let rect, centerX, centerY;
    const maxDistance = 50;
    let joystickTouchId = null;

    function handleStart(e) {
        const touch = e.changedTouches ? e.changedTouches[0] : e;
        if (e.changedTouches) joystickTouchId = touch.identifier;

        joystickActivo = true;
        rect = base.getBoundingClientRect();
        centerX = rect.left + rect.width / 2;
        centerY = rect.top + rect.height / 2;
        updateJoystickVisual(touch.clientX, touch.clientY);
    }

    function handleMove(e) {
        if (!joystickActivo) return;

        let touch = null;
        if (e.touches) {
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === joystickTouchId) {
                    touch = e.touches[i];
                    break;
                }
            }
        } else {
            touch = e;
        }

        if (touch) {
            updateJoystickVisual(touch.clientX, touch.clientY);
        }
    }

    function updateJoystickVisual(clientX, clientY) {
        let dx = clientX - centerX;
        let dy = clientY - centerY;

        let distance = Math.sqrt(dx * dx + dy * dy);
        let angle = Math.atan2(dy, dx);

        if (distance > maxDistance) {
            dx = Math.cos(angle) * maxDistance;
            dy = Math.sin(angle) * maxDistance;
            distance = maxDistance;
        }

        // Actualizar visual de la palanca
        palanca.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

        // Normalizar valores para el movimiento del jugador (-1 a 1)
        joystickVector.x = dx / maxDistance;
        joystickVector.y = -dy / maxDistance;
    }

    function handleEnd(e) {
        if (e.changedTouches) {
            let found = false;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === joystickTouchId) {
                    found = true;
                    break;
                }
            }
            if (!found) return;
        }

        joystickActivo = false;
        joystickTouchId = null;
        joystickVector.x = 0;
        joystickVector.y = 0;
        palanca.style.transform = `translate(-50%, -50%)`;
    }

    container.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Evitar que la cámara detecte este toque
        handleStart(e);
    }, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);

    // --- Botones de Acción (Fase 3) ---
    const btnDisparar = document.getElementById('btn-disparar');
    const btnAgacharse = document.getElementById('btn-agacharse');

    if (btnDisparar) {
        btnDisparar.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Evitar giro de cámara al disparar
            if (activo) disparar(1);
        }, { passive: false });
        // Mouse support for testing
        btnDisparar.addEventListener('mousedown', (e) => {
            if (activo) disparar(1);
        });
    }

    if (btnAgacharse) {
        btnAgacharse.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Evitar giro de cámara al agacharse
            teclas['KeyC'] = true;
        }, { passive: false });
        btnAgacharse.addEventListener('touchend', (e) => {
            teclas['KeyC'] = false;
        });
        // Mouse support for testing
        btnAgacharse.addEventListener('mousedown', () => teclas['KeyC'] = true);
        btnAgacharse.addEventListener('mouseup', () => teclas['KeyC'] = false);
    }

    const btnCamara = document.getElementById('btn-camara');
    if (btnCamara) {
        btnCamara.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Evitar giro de cámara al cambiar vista
            toggleTerceraPersona();
        }, { passive: false });
        // Mouse support for testing
        btnCamara.addEventListener('mousedown', (e) => {
            toggleTerceraPersona();
        });
    }

    // --- Rotación de Cámara por Swipe (Fase 3) ---
    let lastTouchX = 0;
    let lastTouchY = 0;
    let cameraTouchId = null;
    // Sensibilidad adaptativa según DPI para respuesta uniforme (Aumentada significativamente)
    const baseSensitivity = sensiblidad * 10;
    const swipeSensitivity = baseSensitivity / (window.devicePixelRatio || 1);

    window.addEventListener('touchstart', (e) => {
        if (!activo || enCinematica || cameraTouchId !== null) return;

        // El primer toque que llegue aquí (no filtrado por botones/joystick)
        // será el que controle la cámara
        const touch = e.changedTouches[0];
        cameraTouchId = touch.identifier;
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (!activo || enCinematica || cameraTouchId === null) return;

        let touch = null;
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].identifier === cameraTouchId) {
                touch = e.touches[i];
                break;
            }
        }

        if (touch) {
            const touchX = touch.clientX;
            const touchY = touch.clientY;

            const movementX = touchX - lastTouchX;
            const movementY = touchY - lastTouchY;

            yaw -= movementX * swipeSensitivity;
            pitch -= movementY * swipeSensitivity;
            pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));

            lastTouchX = touchX;
            lastTouchY = touchY;
        }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === cameraTouchId) {
                cameraTouchId = null;
                break;
            }
        }
    });

    window.addEventListener('touchcancel', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === cameraTouchId) {
                cameraTouchId = null;
                break;
            }
        }
    });

    // Mouse support for testing on PC (optional)
    container.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
}

// Nueva función unificada para cambiar de cámara (Fase 3)
function toggleTerceraPersona() {
    terceraPersona = !terceraPersona;

    // Mostrar/ocultar modelo del jugador
    if (jugadorObj) {
        jugadorObj.visible = terceraPersona;
    }
    // Ocultar arma inmediatamente al cambiar a tercera persona
    if (grupoArma && terceraPersona) {
        grupoArma.visible = false;
    }
}

init().then(() => {
    bucle();
});
