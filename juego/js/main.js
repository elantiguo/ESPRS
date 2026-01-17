function init() {
    escena = new THREE.Scene();
    escena.background = new THREE.Color(0x010101);
    escena.fog = new THREE.Fog(0x000000, 5, 45);

    camara = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    renderizador = new THREE.WebGLRenderer({ antialias: true });
    renderizador.setSize(window.innerWidth, window.innerHeight);
    renderizador.shadowMap.enabled = true;
    renderizador.shadowMap.type = THREE.PCFShadowMap; // Balance entre calidad y rendimiento
    document.body.appendChild(renderizador.domElement);

    reloj = new THREE.Clock();

    // Inicializar pool de vectores reutilizables
    initVectorPool();

    // Detección de dispositivo táctil
    detectarDispositivoTactil();

    // Inicializar sistema de caché avanzado
    inicializarGameCache();

    // Luces ambientales
    const ambiente = new THREE.AmbientLight(0xffffff, 0.15);
    escena.add(ambiente);

    linterna = new THREE.SpotLight(0xffffff, 1.8, 35, Math.PI / 5, 0.4, 1);
    linterna.castShadow = true;
    // Optimización Fase 3: Reducir resolución de sombras (512x512 es suficiente para linterna)
    linterna.shadow.mapSize.width = 512;
    linterna.shadow.mapSize.height = 512;
    linterna.shadow.camera.near = 0.5;
    linterna.shadow.camera.far = 40;
    escena.add(linterna);
    escena.add(linterna.target);

    generarLaberinto();
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
    // Si el personaje seleccionado es diferente al cargado, actualizamos modelos
    // O si es la primera vez (puede no estar cargado aún o queremos asegurar carga)
    try {
        await actualizarModelosPersonajes();
    } catch (error) {
        console.error("Error cargando modelos al iniciar:", error);
    }

    // Si el juego ha terminado, reiniciamos la simulación sin recargar página
    if (juegoTerminado) {
        reiniciarSimulacion();
    }

    // Ocultar menús y mostrar HUD
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('hud-juego').classList.remove('hidden');
    ocultarPausa();

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
    console.log("Fase 1: Identificación de Operativos...");
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
    console.log("Fase 2: Escaneo de Perímetro...");
    faseCinematica = 1; // Fase de movimiento/animación
    tiempoCinematica = 6; // 6 segundos de recorrido

    // Actualizar texto UI si es necesario
    const cineP = document.getElementById('cine-nombre-p');
    if (cineP) cineP.innerText = "EXPLORANDO CAMPO DE BATALLA...";
}

function finalizarCinematica() {
    console.log("Infiltración Completada. ¡A LUCHAR!");
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
    console.log("Reiniciando simulación Sium...");

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

    // 4. Actualizar UI
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
// CB-16: THROTTLE DE RED OPTIMIZADO
// ========================================
var _lastNetworkUpdate = 0;
var _networkThrottleMs = 100;
var _lastSentPos = { x: 0, y: 0, z: 0, rotY: 0 };
var _lastSentAnimacion = 'parado'; // Rastrear último estado de animación enviado

var _lastLogicUpdate = 0;       // Último tiempo de actualización de lógica
var _logicTickMs = 100;         // Frecuencia de actualización (10Hz)
var _botTargetPos = { x: 0, z: 0 }; // Posición objetivo calculada por la IA
var _botTargetRot = 0;          // Rotación objetivo calculada por la IA
var _botTargetMoviendo = false; // Estado de movimiento objetivo para la IA
var _botTargetAgachado = false; // Estado de agachado objetivo para la IA

// ========================================
// POOL DE VECTORES REUTILIZABLES (Optimización)
// ========================================

function obtenerTileEnPos(x, z) {
    const offset = (DIMENSION * ESCALA) / 2;
    const gx = Math.round((x + offset) / ESCALA);
    const gz = Math.round((z + offset) / ESCALA);
    return laberinto[gz]?.[gx];
}

function bucle(tiempo) {
    requestAnimationFrame(bucle);

    // Manejar primer frame donde tiempo puede ser undefined
    if (!tiempo) tiempo = 0;

    // Calcular delta time real para animaciones
    const dtReal = ultimoTiempo > 0 ? (tiempo - ultimoTiempo) / 1000 : 0.016;
    ultimoTiempo = tiempo;

    const dt = reloj.getDelta();

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
                let targetNombre = "BOT TÁCTICO";

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

    // ========================================
    // CB-04: ACTUALIZAR ANIMACIONES SOLO SI ACTIVO O EN CINEMÁTICA
    // ========================================
    // Actualizar animaciones del bot solo cuando sea necesario
    if (activo || enCinematica) {
        if (botMixer) {
            botMixer.update(dtReal);
        }
        // Actualizar animaciones del jugador si está en tercera persona
        if (jugadorMixer) {
            jugadorMixer.update(dtReal);
        }
    }

    if (activo) {
        // --- LÓGICA DE AGACHARSE (CROUCH) ---
        let quiereAgacharse = teclas['ShiftLeft'] || teclas['ShiftRight'] || teclas['KeyC'];

        // Verificar si estamos bajo un hueco (Tile 2) - usar posicionJugador con radio
        let bajoHueco = false;
        const offset = (DIMENSION * ESCALA) / 2;
        const puntosCheck = [
            { x: posicionJugador.x, z: posicionJugador.z },
            { x: posicionJugador.x + RADIO_JUGADOR * 0.5, z: posicionJugador.z },
            { x: posicionJugador.x - RADIO_JUGADOR * 0.5, z: posicionJugador.z },
            { x: posicionJugador.x, z: posicionJugador.z + RADIO_JUGADOR * 0.5 },
            { x: posicionJugador.x, z: posicionJugador.z - RADIO_JUGADOR * 0.5 }
        ];

        for (let p of puntosCheck) {
            if (obtenerTileEnPos(p.x, p.z) === 2) {
                bajoHueco = true;
                break;
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
        if (teclas['KeyW']) { _vecNextPos.addScaledVector(_vecForward, vel); moviendo = true; }
        if (teclas['KeyS']) { _vecNextPos.addScaledVector(_vecForward, -vel); moviendo = true; }
        if (teclas['KeyA']) { _vecNextPos.addScaledVector(_vecRight, vel); moviendo = true; }
        if (teclas['KeyD']) { _vecNextPos.addScaledVector(_vecRight, -vel); moviendo = true; }

        // Joystick (Fase 2)
        if (joystickVector.x !== 0 || joystickVector.y !== 0) {
            _vecNextPos.addScaledVector(_vecForward, vel * joystickVector.y);
            _vecNextPos.addScaledVector(_vecRight, -vel * joystickVector.x);
            moviendo = true;
        }

        // Pasamos estado 'agachado' a la colisión con RADIO_JUGADOR
        // Mover X independiente (permite deslizarse por paredes)
        if (!colision(_vecNextPos.x, posicionJugador.z, agachado, RADIO_JUGADOR)) {
            posicionJugador.x = _vecNextPos.x;
        }
        // Mover Z independiente
        if (!colision(posicionJugador.x, _vecNextPos.z, agachado, RADIO_JUGADOR)) {
            posicionJugador.z = _vecNextPos.z;
        }
        posicionJugador.y = alturaObjetivo;

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
                cambiarAnimacionJugador(moviendo, agachado);

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

                    // Función para obtener la diferencia de ángulo más corta
                    const shortAngleDist = (a0, a1) => {
                        const max = Math.PI * 2;
                        const da = (a1 - a0) % max;
                        return 2 * da % max - da;
                    };

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

            const camaraOffset = new THREE.Vector3();
            // Invertimos el signo de sin/cos respecto a primera persona para estar detrás
            camaraOffset.x = posicionJugador.x + Math.sin(yaw) * distanciaExtra;
            camaraOffset.z = posicionJugador.z + Math.cos(yaw) * distanciaExtra;
            camaraOffset.y = posicionJugador.y + alturaCamara + alturaExtra;

            // Suavizar movimiento de cámara
            camara.position.x += (camaraOffset.x - camara.position.x) * 8 * dt;
            camara.position.y += (camaraOffset.y - camara.position.y) * 8 * dt;
            camara.position.z += (camaraOffset.z - camara.position.z) * 8 * dt;

            // Cámara mira hacia el jugador
            camara.lookAt(posicionJugador.x, posicionJugador.y + 1, posicionJugador.z);

        } else {
            // PRIMERA PERSONA: Cámara en posición del jugador
            camara.position.x = posicionJugador.x;
            camara.position.z = posicionJugador.z;
            camara.position.y += (alturaObjetivo - camara.position.y) * 10 * dt;
            camara.rotation.set(pitch, yaw, 0, 'YXZ');
        }

        // Actualizar Brazo Sium (solo visible en primera persona Y moviendo)
        if (!terceraPersona) {
            // Mostrar arma solo cuando se mueve
            grupoArma.visible = moviendo;

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
        // En tercera persona, la dirección está invertida respecto al yaw
        let dirX, dirZ;
        if (terceraPersona) {
            dirX = Math.sin(yaw);
            dirZ = Math.cos(yaw);
        } else {
            dirX = -Math.sin(yaw) * Math.cos(pitch);
            dirZ = -Math.cos(yaw) * Math.cos(pitch);
        }
        const dirY = terceraPersona ? 0 : Math.sin(pitch);

        _vecTarget.set(
            posicionJugador.x + dirX * 10,
            posicionJugador.y + dirY * 10,
            posicionJugador.z + dirZ * 10
        );
        linterna.target.position.copy(_vecTarget);

        // --- LÓGICA DE PROYECTILES SIUM (POOLED) ---
        if (projectilePool) {
            projectilePool.update(dt, function (p) {
                // 1. Colisión con BOT (Single Player / Local)
                if (p.owner === 1) {
                    if (botObj) {
                        const dx = p.mesh.position.x - botObj.position.x;
                        const dz = p.mesh.position.z - botObj.position.z;
                        const distXZ = Math.sqrt(dx * dx + dz * dz);
                        // Aumentamos altura un 25% extra según solicitud (3.2 -> 4.0)
                        const h = botAgachado ? 2.5 : 4.5;
                        if (distXZ < RADIO_BOT && p.mesh.position.y >= 0 && p.mesh.position.y <= h) {
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
                            const distXZ = Math.sqrt(dx * dx + dz * dz);
                            const h = jugador.animacionActual === 'agachado' ? 2.5 : 4.5;
                            if (distXZ < 0.8 && p.mesh.position.y >= 0 && p.mesh.position.y <= h) {
                                hitId = id;
                            }
                        });

                        if (hitId) {
                            console.log("🎯 ¡IMPACTO DETECTADO LOCALMENTE!", hitId);
                            if (typeof enviarImpacto === 'function') {
                                enviarImpacto(hitId, 20); // 20 de daño base
                            }
                            return true;
                        }
                    }
                } else if (p.owner === 2) {
                    // Bala del bot local contra jugador local
                    const dx = p.mesh.position.x - posicionJugador.x;
                    const dz = p.mesh.position.z - posicionJugador.z;
                    const distXZ = Math.sqrt(dx * dx + dz * dz);
                    const h = agachado ? 2.5 : 4.5;
                    if (distXZ < RADIO_JUGADOR && p.mesh.position.y >= 0 && p.mesh.position.y <= h) {
                        finalizar("BOT TE ELIMINÓ");
                        return true;
                    }
                }
                return false;
            });
        }

        // ============================================
        // IA TÁCTICA CON MOVIMIENTO POR TICKS (Fase 1)
        // ============================================
        if (!modoMultijugador && botObj) {
            const ahora = Date.now();
            const botPos = { x: botObj.position.x, z: botObj.position.z };
            const jugadorPos = { x: posicionJugador.x, z: posicionJugador.z };
            const esCazador = cazadorId === 2;

            // --- BLOQUE DE TICKS DE LÓGICA (10Hz) ---
            if (ahora - _lastLogicUpdate > _logicTickMs) {
                _vecJugador.set(posicionJugador.x, posicionJugador.y, posicionJugador.z);
                const distBot = botObj.position.distanceTo(_vecJugador);

                // 1. Verificar línea de visión
                const vision = botTactico.tieneLineaDeVision(
                    botPos, jugadorPos, laberinto, DIMENSION, ESCALA
                );

                // 2. Actualizar estado del bot y memoria
                botTactico.actualizarEstado(
                    botPos, jugadorPos, esCazador, vision.visible, distBot, _logicTickMs / 1000, laberinto, DIMENSION, ESCALA
                );

                // 3. Sistema de disparo inteligente
                if (esCazador && botTactico.puedeDisparar(_logicTickMs / 1000)) {
                    if (botTactico.intentarDisparar(distBot, vision.visible)) {
                        disparar(2);
                    }
                }

                // 4. Calcular OBJETIVO de movimiento
                const objetivoBot = botTactico.obtenerObjetivo(botPos, jugadorPos, esCazador, _logicTickMs / 1000);
                const siguientePunto = pathfinder.obtenerSiguientePunto(botPos, objetivoBot);
                const botDebeAgacharse = botTactico.debeAgacharse(botPos, laberinto, DIMENSION, ESCALA, siguientePunto);
                _botTargetAgachado = botDebeAgacharse; // Guardar estado objetivo para el frame loop

                let dirBotRaw;
                if (siguientePunto) {
                    dirBotRaw = { x: siguientePunto.x - botPos.x, z: siguientePunto.z - botPos.z };
                } else {
                    dirBotRaw = { x: objetivoBot.x - botPos.x, z: objetivoBot.z - botPos.z };
                }

                const distMov = Math.sqrt(dirBotRaw.x * dirBotRaw.x + dirBotRaw.z * dirBotRaw.z);

                if (distMov > 0.1) {
                    const dirNormX = dirBotRaw.x / distMov;
                    const dirNormZ = dirBotRaw.z / distMov;
                    const dirSuave = botTactico.suavizarDireccion(dirNormX, dirNormZ, _logicTickMs / 1000);

                    botTactico.intentarEsquivar(botPos, proyectilesSium, _logicTickMs / 1000);
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
                document.getElementById('distancia-bot').innerText =
                    `${distBot.toFixed(1)}m ${botTactico.getEstadoTexto()}`;

                _lastLogicUpdate = ahora;
            }

            // --- APLICACIÓN DE MOVIMIENTO SUAVE (En cada frame) ---
            if (botMoviendo) {
                const velocidadBase = 7 * dt;
                let velocidadBot = botTactico.obtenerVelocidad(velocidadBase);

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
                    const d = j.contenedor.position.distanceTo(posicionJugador);
                    if (d < minDist) minDist = d;
                });
                document.getElementById('distancia-bot').innerText = `${minDist.toFixed(1)}m RIVAL`;
            } else {
                document.getElementById('distancia-bot').innerText = `BUSCANDO...`;
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
            document.getElementById('reloj').innerText = relojActual;
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

init();
bucle();
