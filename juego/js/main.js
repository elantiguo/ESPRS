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

    // Eventos Sium
    // Eventos Sium
    document.addEventListener('keydown', e => {
        teclas[e.code] = true;

        // Toggle tercera persona con Alt
        if (e.code === 'AltLeft' || e.code === 'AltRight') {
            e.preventDefault(); // Evitar que Alt abra menú del navegador
            terceraPersona = !terceraPersona;
            yaw += Math.PI;
            console.log('Modo cámara:', terceraPersona ? 'Tercera Persona' : 'Primera Persona');

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
            // Juego Reanudado
            if (!juegoTerminado) {
                activo = true;
                ocultarPausa();
                reloj.start(); // Opcional: reiniciar delta correcto
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
    if (!activo || document.pointerLockElement !== renderizador.domElement) return;
    yaw -= e.movementX * sensiblidad;
    pitch -= e.movementY * sensiblidad;
    pitch = Math.max(-Math.PI / 2.4, Math.min(Math.PI / 2.4, pitch));
    camara.rotation.set(pitch, yaw, 0, 'YXZ');
}

function iniciarJuego() {
    renderizador.domElement.requestPointerLock();
    juegoTerminado = false;
    activo = true;
    document.getElementById('overlay').classList.add('hidden');
    ocultarPausa();
    reloj.start();
    actualizarUI();
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
        let forward;
        if (terceraPersona) {
            // En tercera persona, la cámara está detrás, así que forward es hacia donde mira el jugador
            forward = new THREE.Vector3(
                Math.sin(yaw),
                0,
                Math.cos(yaw)
            );
        } else {
            // En primera persona, forward es hacia donde mira la cámara
            forward = new THREE.Vector3(
                -Math.sin(yaw),
                0,
                -Math.cos(yaw)
            );
        }
        forward.normalize();

        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).negate();

        // Usar posicionJugador como base, no camara.position
        let nextPos = new THREE.Vector3(posicionJugador.x, posicionJugador.y, posicionJugador.z);
        let moviendo = false;

        // Controles: A=Derecha, D=Izquierda (Solicitados por usuario)
        if (teclas['KeyW']) { nextPos.addScaledVector(forward, vel); moviendo = true; }
        if (teclas['KeyS']) { nextPos.addScaledVector(forward, -vel); moviendo = true; }
        if (teclas['KeyA']) { nextPos.addScaledVector(right, vel); moviendo = true; }
        if (teclas['KeyD']) { nextPos.addScaledVector(right, -vel); moviendo = true; }

        // Pasamos estado 'agachado' a la colisión
        if (!colision(nextPos.x, nextPos.z, agachado)) {
            // Guardar posición del jugador
            posicionJugador.x = nextPos.x;
            posicionJugador.z = nextPos.z;
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

                // Cambiar animación según movimiento
                cambiarAnimacionJugador(moviendo);

                // Rotar modelo hacia la dirección de movimiento
                if (moviendo) {
                    const anguloJugador = Math.atan2(forward.x, forward.z);
                    jugadorObj.rotation.y = anguloJugador;
                }

                // Ajustar escala si está agachado
                if (jugadorModelo) {
                    const escalaY = agachado ? 0.0006 : 0.0008;
                    jugadorModelo.scale.y += (escalaY - jugadorModelo.scale.y) * 8 * dt;
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

        const targetPos = new THREE.Vector3(
            posicionJugador.x + dirX * 10,
            posicionJugador.y + dirY * 10,
            posicionJugador.z + dirZ * 10
        );
        linterna.target.position.copy(targetPos);

        // --- LÓGICA DE PROYECTILES SIUM ---
        const velocidadBala = 45 * dt;
        for (let i = proyectilesSium.length - 1; i >= 0; i--) {
            const p = proyectilesSium[i];
            p.mesh.position.addScaledVector(p.dir, velocidadBala);
            p.dist += velocidadBala;

            // Colisión con paredes
            // Bala pasa hueco si su altura es menor a 1.8 (aprox)
            const balaBaja = p.mesh.position.y < 1.8;
            if (colision(p.mesh.position.x, p.mesh.position.z, balaBaja)) {
                escena.remove(p.mesh);
                proyectilesSium.splice(i, 1);
                continue;
            }

            // Colisión con personajes
            if (p.owner === 1) { // Bala del humano
                if (p.mesh.position.distanceTo(botObj.position) < 1.5) {
                    finalizar("¡HAS GANADO!");
                    break;
                }
            } else { // Bala del bot
                const jugadorVecBala = new THREE.Vector3(posicionJugador.x, posicionJugador.y, posicionJugador.z);
                if (p.mesh.position.distanceTo(jugadorVecBala) < 1.0) {
                    finalizar("BOT TE ELIMINÓ");
                    break;
                }
            }

            // Rango máximo
            if (p.dist > 60) {
                escena.remove(p.mesh);
                proyectilesSium.splice(i, 1);
            }
        }

        // ============================================
        // BOT IA TÁCTICA CON MOVIMIENTO NATURAL
        // ============================================
        // Usar posicionJugador en lugar de camara.position para soportar tercera persona
        const jugadorVec = new THREE.Vector3(posicionJugador.x, posicionJugador.y, posicionJugador.z);
        const distBot = botObj.position.distanceTo(jugadorVec);
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

        // Cambiar animación del bot según movimiento
        cambiarAnimacionBot(botSeMovio);

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

        // El modelo está en el suelo, no necesita ajuste de altura como el cubo
        // Solo ajustar si está agachado (reducir escala Y del modelo)
        if (botModelo) {
            const escalaY = botDebeAgacharse ? 0.0006 : 0.0008;
            botModelo.scale.y += (escalaY - botModelo.scale.y) * 8 * dt;
        }

        // Temporizador de roles
        tiempo -= dt;
        if (tiempo <= 0) {
            tiempo = 30;
            cazadorId = cazadorId === 1 ? 2 : 1;
            actualizarUI();
        }
        document.getElementById('reloj').innerText = Math.ceil(tiempo);
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
