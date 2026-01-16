function init() {
    escena = new THREE.Scene();
    escena.background = new THREE.Color(0x010101);
    escena.fog = new THREE.Fog(0x000000, 5, 45);

    camara = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    renderizador = new THREE.WebGLRenderer({ antialias: true });
    renderizador.setSize(window.innerWidth, window.innerHeight);
    renderizador.shadowMap.enabled = true;
    document.body.appendChild(renderizador.domElement);

    reloj = new THREE.Clock();

    // Inicializar pool de vectores reutilizables
    initVectorPool();

    // Inicializar sistema de caché avanzado
    inicializarGameCache();

    // Luces ambientales
    const ambiente = new THREE.AmbientLight(0xffffff, 0.15);
    escena.add(ambiente);

    linterna = new THREE.SpotLight(0xffffff, 1.8, 35, Math.PI / 5, 0.4, 1);
    linterna.castShadow = true;
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
            terceraPersona = !terceraPersona;
            yaw += Math.PI;

            // Mostrar/ocultar modelo del jugador (el arma se maneja en el bucle)
            if (jugadorObj) {
                jugadorObj.visible = terceraPersona;
            }
            // Ocultar arma inmediatamente al cambiar a tercera persona
            if (grupoArma && terceraPersona) {
                grupoArma.visible = false;
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

function iniciarJuego() {
    // Si el personaje seleccionado es diferente al cargado, actualizamos modelos
    if (idPersonajeSeleccionado !== idPersonajeCargado) {
        actualizarModelosPersonajes();
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
    if (botObj) botObj.visible = true;

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
}

function reiniciarSimulacion() {
    console.log("Reiniciando simulación Sium...");

    // 1. Resetear estados de juego
    juegoTerminado = false;
    activo = false;
    tiempo = 30;
    cazadorId = 1;

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
                document.getElementById('cine-nombre-b').innerText = `ESTADO: EN ESPERA`;
            } else {
                // Siguientes 5 segundos: Identificar Bot
                const target = botObj.position;
                // Posición fija de cámara para ver al bot
                camara.position.set(target.x - 4, 3, target.z - 4);
                camara.lookAt(target.x, 1.5, target.z);

                const bId = idPersonajeSeleccionado === 'agente' ? 'cill' : 'agente';
                const bNombre = personajesSium[bId].nombre;
                document.getElementById('cine-nombre-p').innerText = `OBJETIVO LOCALIZADO`;
                document.getElementById('cine-nombre-b').innerText = `AMENAZA: ${bNombre}`;
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

    // Actualizar animaciones del bot SIEMPRE (incluso en pausa para que se vea)
    if (botMixer) {
        botMixer.update(dtReal);
    }
    // Actualizar animaciones del jugador si está en tercera persona
    if (jugadorMixer) {
        jugadorMixer.update(dtReal);
    }

    if (activo) {
        // --- LÓGICA DE AGACHARSE (CROUCH) ---
        let quiereAgacharse = teclas['ShiftLeft'] || teclas['ShiftRight'];

        // Verificar si estamos bajo un hueco (Tile 2) - usar posicionJugador
        const tileActual = obtenerTileEnPos(posicionJugador.x, posicionJugador.z);
        if (tileActual === 2) {
            quiereAgacharse = true; // Forzar agachado
        }

        const agachado = quiereAgacharse;
        const alturaObjetivo = agachado ? 1.0 : 2.0;

        // Ajuste de velocidad
        const multiplicadorVel = agachado ? 3.5 : 7;
        const vel = multiplicadorVel * dt;

        // Calcular dirección de movimiento basándose en yaw
        // En primera persona: forward es hacia donde mira la cámara
        // En tercera persona: forward es alejándose de la cámara (cámara está detrás)
        if (terceraPersona) {
            // En tercera persona, la cámara está detrás, así que forward es hacia donde mira el jugador
            _vecForward.set(Math.sin(yaw), 0, Math.cos(yaw));
        } else {
            // En primera persona, forward es hacia donde mira la cámara
            _vecForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        }
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

        // Pasamos estado 'agachado' a la colisión
        if (!colision(_vecNextPos.x, _vecNextPos.z, agachado)) {
            // Guardar posición del jugador
            posicionJugador.x = _vecNextPos.x;
            posicionJugador.z = _vecNextPos.z;
            posicionJugador.y = alturaObjetivo;
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
                    jugadorObj.rotation.y = yaw;
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
                    } else if (jugadorMoviendo) {
                        targetX = caminarRotacionX;
                        targetY = caminarRotacionY;
                        targetZ = caminarRotacionZ;
                    } else {
                        targetX = paradoRotacionX;
                        targetY = paradoRotacionY;
                        targetZ = paradoRotacionZ;
                    }

                    // Interpolar rotación suavemente (10 * dt es ~0.3s)
                    jugadorContenedor.rotation.x += (targetX - jugadorContenedor.rotation.x) * 10 * dt;
                    jugadorContenedor.rotation.y += (targetY - jugadorContenedor.rotation.y) * 10 * dt;
                    jugadorContenedor.rotation.z += (targetZ - jugadorContenedor.rotation.z) * 10 * dt;
                }
            }

            // Posicionar cámara detrás del jugador usando pitch para altura
            // pitch negativo = mirar arriba = cámara más alta
            const alturaExtra = -pitch * 3; // Multiplicador para la altura basada en pitch
            const distanciaExtra = Math.cos(pitch) * distanciaCamara; // Ajustar distancia con pitch

            const camaraOffset = new THREE.Vector3();
            camaraOffset.x = posicionJugador.x - Math.sin(yaw) * distanciaExtra;
            camaraOffset.z = posicionJugador.z - Math.cos(yaw) * distanciaExtra;
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
                // Colisión con personajes
                if (p.owner === 1) { // Bala del humano
                    if (p.mesh.position.distanceTo(botObj.position) < 1.5) {
                        finalizar("¡HAS GANADO!");
                        return true;
                    }
                } else { // Bala del bot
                    _vecJugador.set(posicionJugador.x, posicionJugador.y, posicionJugador.z);
                    if (p.mesh.position.distanceTo(_vecJugador) < 1.0) {
                        finalizar("BOT TE ELIMINÓ");
                        return true;
                    }
                }
                return false;
            });
        }

        // ============================================
        // BOT IA TÁCTICA CON MOVIMIENTO NATURAL
        // ============================================
        // Usar posicionJugador en lugar de camara.position para soportar tercera persona
        _vecJugador.set(posicionJugador.x, posicionJugador.y, posicionJugador.z);
        const distBot = botObj.position.distanceTo(_vecJugador);
        const botPos = { x: botObj.position.x, z: botObj.position.z };
        const jugadorPos = { x: posicionJugador.x, z: posicionJugador.z };
        const esCazador = cazadorId === 2;

        // Verificar línea de visión
        const vision = botTactico.tieneLineaDeVision(
            botPos, jugadorPos, laberinto, DIMENSION, ESCALA
        );

        // Actualizar estado del bot (ahora con dt y laberinto para comportamientos avanzados)
        const estado = botTactico.actualizarEstado(
            botPos, jugadorPos, esCazador, vision.visible, distBot, dt, laberinto, DIMENSION, ESCALA
        );

        // Mostrar información en HUD con nuevo formato
        document.getElementById('distancia-bot').innerText =
            `${distBot.toFixed(1)}m ${botTactico.getEstadoTexto()}`;

        // Verificar captura (solo cazador)
        if (esCazador && distBot < 1.8) {
            finalizar("EL BOT TE ATRAPÓ");
        }

        // Sistema de disparo inteligente
        if (esCazador && botTactico.puedeDisparar(dt)) {
            if (botTactico.intentarDisparar(distBot, vision.visible)) {
                disparar(2);
            }
        }

        // Obtener objetivo basado en estado (ahora con dt para timing de waypoints)
        const objetivoBot = botTactico.obtenerObjetivo(botPos, jugadorPos, esCazador, dt);

        // Usar pathfinding para obtener siguiente punto (ANTES de verificar agacharse)
        const siguientePunto = pathfinder.obtenerSiguientePunto(
            botPos, objetivoBot
        );

        // Verificar si el bot debe agacharse (pasamos el siguiente punto para anticipar)
        const botDebeAgacharse = botTactico.debeAgacharse(botPos, laberinto, DIMENSION, ESCALA, siguientePunto);

        // Calcular dirección de movimiento
        let dirBotRaw;
        if (siguientePunto) {
            dirBotRaw = {
                x: siguientePunto.x - botObj.position.x,
                z: siguientePunto.z - botObj.position.z
            };
        } else {
            dirBotRaw = {
                x: objetivoBot.x - botObj.position.x,
                z: objetivoBot.z - botObj.position.z
            };
        }

        // Solo mover si hay distancia significativa
        const distMov = Math.sqrt(dirBotRaw.x * dirBotRaw.x + dirBotRaw.z * dirBotRaw.z);
        const botSeMovio = distMov > 0.1;

        // Cambiar animación del bot según movimiento y si debe agacharse
        cambiarAnimacionBot(botSeMovio, botDebeAgacharse);

        if (botSeMovio) {
            // Normalizar dirección raw
            const dirNormX = dirBotRaw.x / distMov;
            const dirNormZ = dirBotRaw.z / distMov;

            // Suavizar dirección para giros naturales
            const dirSuave = botTactico.suavizarDireccion(dirNormX, dirNormZ, dt);

            // ===== SISTEMA DE ESQUIVE DE PROYECTILES =====
            // Intentar esquivar proyectiles enemigos
            botTactico.intentarEsquivar(botPos, proyectilesSium, dt);
            const esquive = botTactico.obtenerModificadorEsquive();

            // Aplicar modificador de esquive a la dirección
            let dirFinalX = dirSuave.x;
            let dirFinalZ = dirSuave.z;

            if (esquive.activo) {
                // Cuando esquiva, priorizar la dirección de esquive
                dirFinalX = dirSuave.x * 0.3 + esquive.x * 0.7;
                dirFinalZ = dirSuave.z * 0.3 + esquive.z * 0.7;

                // Normalizar resultado
                const magFinal = Math.sqrt(dirFinalX * dirFinalX + dirFinalZ * dirFinalZ);
                if (magFinal > 0) {
                    dirFinalX /= magFinal;
                    dirFinalZ /= magFinal;
                }
            }

            // Velocidad variable según estado (más rápido si esquiva)
            // Velocidad base 7 = igual que el jugador
            const velocidadBase = 7 * dt;
            let velocidadBot = botTactico.obtenerVelocidad(velocidadBase);
            if (esquive.activo) {
                velocidadBot *= 2.0; // Boost de velocidad al esquivar (2x)
            }

            // Calcular nueva posición
            const nX = botObj.position.x + dirFinalX * velocidadBot;
            const nZ = botObj.position.z + dirFinalZ * velocidadBot;

            // Mover X independiente (permite deslizarse por paredes)
            if (!colision(nX, botObj.position.z, botDebeAgacharse)) {
                botObj.position.x = nX;
            }

            // Mover Z independiente
            if (!colision(botObj.position.x, nZ, botDebeAgacharse)) {
                botObj.position.z = nZ;
            }

            // Rotar el bot para que mire hacia la dirección de movimiento
            const anguloRotacion = Math.atan2(dirFinalX, dirFinalZ);
            botObj.rotation.y = anguloRotacion;
        }

        // FORZAR escala fija del bot (la animación FBX tiene keyframes de escala)
        if (botModelo) {
            const escalaY = botDebeAgacharse ? ESCALA_AGACHADO : ESCALA_PERSONAJE;
            botModelo.scale.set(ESCALA_PERSONAJE, escalaY, ESCALA_PERSONAJE);
        }

        // SUAVIZAR rotación del bot (evita saltos al cambiar animación)
        if (botContenedor) {
            let targetX, targetY, targetZ;

            if (botDebeAgacharse) {
                targetX = agachadoRotacionX;
                targetY = agachadoRotacionY;
                targetZ = agachadoRotacionZ;
            } else if (botMoviendo) {
                targetX = caminarRotacionX;
                targetY = caminarRotacionY;
                targetZ = caminarRotacionZ;
            } else {
                targetX = paradoRotacionX;
                targetY = paradoRotacionY;
                targetZ = paradoRotacionZ;
            }

            // Interpolar rotación suavemente (10 * dt es ~0.3s)
            botContenedor.rotation.x += (targetX - botContenedor.rotation.x) * 10 * dt;
            botContenedor.rotation.y += (targetY - botContenedor.rotation.y) * 10 * dt;
            botContenedor.rotation.z += (targetZ - botContenedor.rotation.z) * 10 * dt;
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

    renderizador.render(escena, camara);
}

init();
bucle();
