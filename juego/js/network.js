/**
 * SIUM DUEL - Cliente de Red v2.0
 * 
 * Sistema completo de conexión con soporte para:
 * - Salas/Lobby
 * - Sincronización de jugadores
 * - Sistema de combate en red
 */

// ========================================
// CONFIGURACIÓN DE RED
// ========================================
var SERVIDOR_URL = window.location.origin; // Se ajusta automáticamente (localhost o Render)
var socket = null;
var modoMultijugador = false;
var miSocketId = null;
var salaActual = null;
var jugadoresRemotos = new Map(); // id -> { modelo, posicionObjetivo, rotacionObjetivo, personaje }
var ultimoPing = 0;
var latenciaActual = 0;
var vidaJugador = 100;

// Callbacks para eventos (para que UI pueda reaccionar)
var networkCallbacks = {
    onConectado: null,
    onDesconectado: null,
    onSalaCreada: null,
    onSalaUnido: null,
    onJugadorUnido: null,
    onJugadorSalio: null,
    onSalaActualizada: null,
    onPartidaIniciando: null,
    onJugadorDanado: null,
    onJugadorMurio: null,
    onPartidaFinalizada: null
};

// ========================================
// CONEXIÓN AL SERVIDOR
// ========================================
function conectarServidor(callback) {
    if (socket && socket.connected) {
        console.log('⚠️ Ya conectado al servidor');
        if (callback) callback({ exito: true, yaConectado: true });
        return;
    }

    socket = io(SERVIDOR_URL, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socket.on('connect', () => {
        console.log('✅ Conectado al servidor:', socket.id);
        miSocketId = socket.id;
        modoMultijugador = true;

        if (networkCallbacks.onConectado) networkCallbacks.onConectado(socket.id);

        // Sincronizar personaje seleccionado al conectar
        if (typeof idPersonajeSeleccionado !== 'undefined') {
            enviarPersonaje(idPersonajeSeleccionado);
        }

        if (callback) callback({ exito: true });
    });

    socket.on('disconnect', () => {
        console.log('❌ Desconectado del servidor');
        modoMultijugador = false;
        salaActual = null;
        limpiarJugadoresRemotos();

        if (networkCallbacks.onDesconectado) networkCallbacks.onDesconectado();
    });

    socket.on('connect_error', (error) => {
        console.error('❌ Error de conexión:', error.message);
        if (callback) callback({ exito: false, error: error.message });
    });

    // ========================================
    // EVENTOS DE SALA
    // ========================================

    socket.on('sala:jugadorUnido', (data) => {
        console.log('🎮 Nuevo jugador en sala:', data.jugador.id);
        salaActual = data.sala;
        crearJugadorRemoto(data.jugador);

        if (networkCallbacks.onJugadorUnido) networkCallbacks.onJugadorUnido(data);
    });

    socket.on('sala:jugadorSalio', (data) => {
        console.log('👋 Jugador salió de sala:', data.jugadorId);
        removerJugadorRemoto(data.jugadorId);

        if (networkCallbacks.onJugadorSalio) networkCallbacks.onJugadorSalio(data);
    });

    socket.on('sala:actualizada', (data) => {
        salaActual = data.sala;
        if (networkCallbacks.onSalaActualizada) networkCallbacks.onSalaActualizada(data);
    });

    socket.on('sala:todosListos', () => {
        console.log('✅ Todos los jugadores están listos!');
    });

    socket.on('partida:iniciando', (data) => {
        console.log('🎮 ¡Partida iniciando!');
        salaActual = data.sala;

        // IMPORTANTE: Guardar el mapa recibido del servidor
        if (data.mapa) {
            if (typeof window !== 'undefined') {
                window.mapaServidor = data.mapa;
                console.log('🗺️ Mapa recibido del servidor:', data.mapa.length + 'x' + data.mapa[0].length);
            }
        }

        // Crear modelos para todos los jugadores de la sala
        data.sala.jugadores.forEach(j => {
            if (j.id !== miSocketId) {
                crearJugadorRemoto(j);
            }
        });

        if (networkCallbacks.onPartidaIniciando) networkCallbacks.onPartidaIniciando(data);
    });

    // ========================================
    // EVENTOS DE JUEGO
    // ========================================

    socket.on('jugador:movio', (data) => {
        actualizarJugadorRemoto(data);
    });

    socket.on('jugador:disparo', (data) => {
        console.log('💥 Disparo de:', data.id);
        renderizarDisparoRemoto(data);
    });

    socket.on('jugador:danado', (data) => {
        // Notificación visual si yo soy el atacante
        if (data.atacanteId === miSocketId) {
            if (typeof mostrarNotificacionCombate === 'function') {
                mostrarNotificacionCombate(`🎯 IMPACTO: -${data.dano}`, '#eab308');
            }
        }

        // Si soy la víctima, actualizar mi vida
        if (data.victimaId === miSocketId) {
            vidaJugador = data.vidaRestante;
            actualizarHUD();
            if (typeof mostrarNotificacionCombate === 'function') {
                mostrarNotificacionCombate(`💔 RECIBISTE DAÑO: -${data.dano}`, '#ef4444');
            }
        }

        if (networkCallbacks.onJugadorDanado) networkCallbacks.onJugadorDanado(data);
    });

    socket.on('jugador:murio', (data) => {
        const victimaNombre = data.jugadorId === miSocketId ? 'TÚ' : 'Oponente';
        const asesinoNombre = data.asesinoId === miSocketId ? 'TÚ' : 'Oponente';

        if (typeof mostrarNotificacionCombate === 'function') {
            mostrarNotificacionCombate(`☠️ ${asesinoNombre} ELIMINÓ A ${victimaNombre}`, '#000000');
        }

        if (networkCallbacks.onJugadorMurio) networkCallbacks.onJugadorMurio(data);
    });

    socket.on('jugador:desconectado', (data) => {
        removerJugadorRemoto(data.jugadorId);
    });

    socket.on('jugador:cambioPersonaje', (data) => {
        const info = jugadoresRemotos.get(data.jugadorId);
        if (info) {
            console.log(`👤 Jugador ${data.jugadorId} cambió skin a: ${data.personaje}`);

            // Guardar posición actual para heredarla
            const x = info.contenedor.position.x;
            const z = info.contenedor.position.z;
            const rotY = info.contenedor.rotation.y;

            // Eliminar modelo anterior
            removerJugadorRemoto(data.jugadorId);

            // Crear nuevo con data actualizada
            crearJugadorRemoto({
                id: data.jugadorId,
                personaje: data.personaje,
                x: x,
                y: 0,
                z: z,
                rotY: rotY
            });
        }
    });

    // ========================================
    // EVENTOS DE FIN DE PARTIDA
    // ========================================

    socket.on('partida:finalizada', (data) => {
        console.log(`🏆 Partida finalizada! Ganador: ${data.ganadorId}`);

        const esGanador = data.ganadorId === miSocketId;

        // Mostrar pantalla de resultados
        mostrarResultadoPartida(esGanador, data);

        if (networkCallbacks.onPartidaFinalizada) {
            networkCallbacks.onPartidaFinalizada(data);
        }
    });
}

// ========================================
// FUNCIONES DE SALA
// ========================================

function crearSala(nombre, callback) {
    if (!socket?.connected) {
        if (callback) callback({ exito: false, error: 'No conectado' });
        return;
    }

    socket.emit('sala:crear', { nombre }, (resultado) => {
        if (resultado.exito) {
            salaActual = resultado.sala;
            console.log('🏠 Sala creada:', resultado.sala.id);
            if (networkCallbacks.onSalaCreada) networkCallbacks.onSalaCreada(resultado);
        }
        if (callback) callback(resultado);
    });
}

function unirseASala(codigo, callback) {
    if (!socket?.connected) {
        if (callback) callback({ exito: false, error: 'No conectado' });
        return;
    }

    socket.emit('sala:unirse', { codigo: codigo.toUpperCase() }, (resultado) => {
        if (resultado.exito) {
            salaActual = resultado.sala;
            console.log('➕ Unido a sala:', resultado.sala.id);

            // Crear modelos para jugadores existentes
            resultado.sala.jugadores.forEach(j => {
                if (j.id !== miSocketId) {
                    crearJugadorRemoto(j);
                }
            });

            if (networkCallbacks.onSalaUnido) networkCallbacks.onSalaUnido(resultado);
        }
        if (callback) callback(resultado);
    });
}

function salirDeSala(callback) {
    if (!socket?.connected || !salaActual) {
        if (callback) callback({ exito: false });
        return;
    }

    socket.emit('sala:salir', (resultado) => {
        salaActual = null;
        limpiarJugadoresRemotos();
        if (callback) callback(resultado);
    });
}

function listarSalas(callback) {
    if (!socket?.connected) {
        if (callback) callback({ salas: [] });
        return;
    }

    socket.emit('sala:listar', (resultado) => {
        if (callback) callback(resultado);
    });
}

function marcarListo(listo = true, callback) {
    if (!socket?.connected) {
        if (callback) callback({ exito: false });
        return;
    }

    socket.emit('sala:listo', { listo }, (resultado) => {
        if (callback) callback(resultado);
    });
}

function iniciarPartida(callback) {
    if (!socket?.connected) {
        if (callback) callback({ exito: false });
        return;
    }

    socket.emit('partida:iniciar', (resultado) => {
        if (callback) callback(resultado);
    });
}

// ========================================
// FUNCIONES DE JUEGO
// ========================================

function enviarPosicion(x, y, z, rotY, animacion) {
    if (!socket?.connected || !modoMultijugador) return;

    // Optimización Fase 2: Reducir precisión para ahorrar ancho de banda (JSON más corto)
    socket.emit('jugador:mover', {
        x: Number(x.toFixed(3)),
        y: Number(y.toFixed(3)),
        z: Number(z.toFixed(3)),
        rotY: Number(rotY.toFixed(3)),
        animacion
    });
}

function enviarDisparo(origenX, origenY, origenZ, direccionX, direccionY, direccionZ) {
    if (!socket?.connected || !modoMultijugador) return;

    socket.emit('jugador:disparar', {
        origenX: Number(origenX.toFixed(3)),
        origenY: Number(origenY.toFixed(3)),
        origenZ: Number(origenZ.toFixed(3)),
        direccionX: Number(direccionX.toFixed(3)),
        direccionY: Number(direccionY.toFixed(3)),
        direccionZ: Number(direccionZ.toFixed(3)),
        timestamp: Date.now()
    });
}

function enviarImpacto(victimaId, dano) {
    if (!socket?.connected || !modoMultijugador) return;

    socket.emit('jugador:impacto', { victimaId, dano });
}

function enviarPersonaje(personaje) {
    if (!socket?.connected) return;

    socket.emit('jugador:personaje', { personaje });
}

// ========================================
// GESTIÓN DE JUGADORES REMOTOS
// ========================================

function crearJugadorRemoto(data) {
    if (jugadoresRemotos.has(data.id)) return;

    const personajeId = data.personaje || 'agente';
    const pData = personajesSium[personajeId];

    // Contenedor principal
    const contenedor = new THREE.Group();
    contenedor.position.set(data.x || 0, 0, data.z || 0);
    contenedor.rotation.y = data.rotY || 0;

    // Placeholder (cubo) mientras carga
    const geoP = new THREE.BoxGeometry(0.8, 1.8, 0.8);
    const matP = new THREE.MeshLambertMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 });
    const placeholder = new THREE.Mesh(geoP, matP);
    placeholder.position.y = 0.9;
    contenedor.add(placeholder);

    // Luz de identificación
    const luz = new THREE.PointLight(0x00ff00, 1, 5);
    luz.position.set(0, 2, 0);
    luz.matrixAutoUpdate = false; // Optimización menor
    luz.updateMatrix();
    contenedor.add(luz);

    if (typeof escena !== 'undefined') escena.add(contenedor);

    const infoJugador = {
        id: data.id,
        contenedor: contenedor,
        luz: luz, // Guardar referencia para gestión dinámica (Fase 3)
        modelo: null,
        mixer: null,
        animaciones: { caminar: null, parado: null, agachado: null, disparar: null },
        posicionObjetivo: new THREE.Vector3(data.x || 0, 0, data.z || 0),
        rotacionObjetivo: data.rotY || 0,
        animacionActual: 'parado',
        personaje: personajeId,
        placeholder: placeholder
    };

    jugadoresRemotos.set(data.id, infoJugador);

    // Cargar Modelos y Animaciones
    if (typeof cargarFBX === 'function' && pData) {
        // Usar CAMINAR como base (suele tener la malla completa)
        cargarFBX(pData.modelos.caminar, (fbx) => {
            fbx.scale.set(ESCALA_PERSONAJE, ESCALA_PERSONAJE, ESCALA_PERSONAJE);

            // Limpieza y texturas
            let manualTex = pData.textura ? cargarTextura(pData.textura) : null;
            const lightsToRemove = [];

            fbx.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    // Manejar materiales (pueden ser arrays)
                    const applyTex = (m) => {
                        if (manualTex) {
                            m.map = manualTex;
                            m.color.set(0xffffff);
                        }
                        m.needsUpdate = true;
                    };

                    if (Array.isArray(child.material)) {
                        child.material.forEach(applyTex);
                    } else if (child.material) {
                        applyTex(child.material);
                    }
                }
                const n = child.name.toLowerCase();
                if (n.includes('tmpqebahx5v') || n.includes('.obj') || n.includes('gun') || n.includes('weapon')) {
                    infoJugador.armaObj = child;
                    child.visible = false;
                }
                if (child.isLight) lightsToRemove.push(child);
            });

            // Remover luces incrustadas
            lightsToRemove.forEach(l => { if (l.parent) l.parent.remove(l); });

            // Quitar placeholder
            contenedor.remove(placeholder);
            contenedor.add(fbx);
            infoJugador.modelo = fbx;

            // Configurar Mixer y Animaciones
            infoJugador.mixer = new THREE.AnimationMixer(fbx);

            if (typeof limpiarAnimacionesEscala === 'function') {
                limpiarAnimacionesEscala(fbx.animations);
            }

            // Cargar animaciones básicas
            const cargarAnim = (url, tipo) => {
                cargarFBX(url, (animFbx) => {
                    if (animFbx.animations && animFbx.animations.length > 0) {
                        if (typeof limpiarAnimacionesEscala === 'function') {
                            limpiarAnimacionesEscala(animFbx.animations);
                        }
                        const action = infoJugador.mixer.clipAction(animFbx.animations[0]);
                        infoJugador.animaciones[tipo] = action;
                        if (tipo === 'parado') action.play();
                    }
                });
            };

            cargarAnim(pData.modelos.parado, 'parado');
            cargarAnim(pData.modelos.caminar, 'caminar');
            cargarAnim(pData.modelos.agachado, 'agachado');
            if (pData.modelos.disparo) {
                cargarAnim(pData.modelos.disparo, 'disparar');
            }
        });
    }

    console.log(`👤 Jugador remoto creado con FBX: ${data.id}`);
}

function actualizarJugadorRemoto(data) {
    const jugador = jugadoresRemotos.get(data.id);
    if (!jugador) {
        crearJugadorRemoto(data);
        return;
    }

    // Actualizar objetivos
    jugador.posicionObjetivo.set(data.x, 0, data.z);
    jugador.rotacionObjetivo = data.rotY;

    // Toggle visibilidad del arma remota
    if (jugador.armaObj) {
        const moviendo = data.animacion === 'caminar';
        const agachado = data.animacion === 'agachado';
        jugador.armaObj.visible = moviendo && !agachado;
    }

    // Gestionar Animaciones
    if (data.animacion && jugador.animacionActual !== data.animacion) {
        const vieja = jugador.animaciones[jugador.animacionActual];
        const nueva = jugador.animaciones[data.animacion];

        if (nueva) {
            if (vieja) {
                const clipVieja = vieja.getClip();
                const nombreLower = clipVieja.name.toLowerCase();
                const esArma = nombreLower.includes('tmpqebahx5v') || nombreLower.includes('.obj') || nombreLower.includes('gun') || nombreLower.includes('weapon');

                // Si es un track de arma y no se está moviendo (o está agachado), stop inmediato
                const moviendo = data.animacion === 'caminar';
                const agachado = data.animacion === 'agachado';

                if (esArma && (!moviendo || agachado)) {
                    vieja.stop();
                } else {
                    vieja.fadeOut(0.2);
                }
            }

            const clipNueva = nueva.getClip();
            const nombreLowerNueva = clipNueva.name.toLowerCase();
            const esArmaNueva = nombreLowerNueva.includes('tmpqebahx5v') || nombreLowerNueva.includes('.obj') || nombreLowerNueva.includes('gun') || nombreLowerNueva.includes('weapon');

            const moviendoNueva = data.animacion === 'caminar';
            const agachadoNueva = data.animacion === 'agachado';

            if (esArmaNueva && (!moviendoNueva || agachadoNueva)) {
                nueva.stop();
            } else {
                nueva.reset().fadeIn(0.2).play();
            }

            jugador.animacionActual = data.animacion;
        }
    }
}

function removerJugadorRemoto(id) {
    const jugador = jugadoresRemotos.get(id);
    if (jugador) {
        if (typeof escena !== 'undefined') {
            escena.remove(jugador.contenedor);
        }
        jugadoresRemotos.delete(id);
        console.log(`🗑️ Jugador remoto removido: ${id}`);
    }
}

function limpiarJugadoresRemotos() {
    jugadoresRemotos.forEach((jugador) => {
        if (typeof escena !== 'undefined') {
            escena.remove(jugador.contenedor);
        }
    });
    jugadoresRemotos.clear();
}

// ========================================
// INTERPOLACIÓN Y ANIMACIÓN (llamar cada frame)
// ========================================

function actualizarJugadoresRemotos(deltaTime) {
    const SUAVIZADO = 12;

    jugadoresRemotos.forEach((jugador) => {
        if (!jugador.contenedor) return;

        // Suavizado de posición
        jugador.contenedor.position.lerp(jugador.posicionObjetivo, SUAVIZADO * deltaTime);

        // Suavizado de posición
        jugador.contenedor.position.lerp(jugador.posicionObjetivo, SUAVIZADO * deltaTime);

        // Suavizado de rotación (Shortest Path Angle Lerp)
        const a0 = jugador.contenedor.rotation.y;
        const a1 = jugador.rotacionObjetivo;
        const max = Math.PI * 2;
        const da = (a1 - a0) % max;
        const shortDist = 2 * da % max - da;

        jugador.contenedor.rotation.y += shortDist * SUAVIZADO * deltaTime;

        // Optimización Fase 3: Gestión dinámica de luces
        // Solo activar luz si el jugador está en un radio de 20 metros
        if (jugador.luz) {
            const distSq = jugador.contenedor.position.distanceToSquared(camara.position);
            jugador.luz.visible = distSq < 400; // 20 * 20
        }

        // Update Mixer
        if (jugador.mixer) {
            jugador.mixer.update(deltaTime);
        }
    });
}

// ========================================
// RENDERIZAR DISPARO REMOTO (CON LAG COMPENSATION)
// ========================================

function renderizarDisparoRemoto(data) {
    if (typeof projectilePool === 'undefined' || !projectilePool) return;

    // ========================================
    // ACTIVAR ANIMACIÓN DE DISPARO DEL JUGADOR REMOTO
    // ========================================
    const jugadorRemoto = jugadoresRemotos.get(data.id);
    console.log(`📥 [Disparo Remoto] Recibido de: ${data.id}`, jugadorRemoto ? '✅ Jugador encontrado' : '❌ Jugador NO encontrado');

    if (jugadorRemoto && jugadorRemoto.mixer) {
        // Buscar animaciones de disparo si existen
        const personajeId = jugadorRemoto.personaje || 'agente';
        const pData = personajesSium[personajeId];

        console.log(`   Personaje: ${personajeId}, tiene disparo: ${pData?.modelos?.disparo ? 'SÍ' : 'NO'}`);
        console.log(`   Animación ya cargada: ${jugadorRemoto.animaciones.disparar ? 'SÍ' : 'NO'}`);

        if (pData && pData.modelos.disparo && !jugadorRemoto.animaciones.disparar) {
            // Cargar animación de disparo si no está cargada
            console.log(`   🔄 Cargando animación de disparo...`);
            if (typeof cargarFBX === 'function') {
                cargarFBX(pData.modelos.disparo, (animFbx) => {
                    if (animFbx.animations && animFbx.animations.length > 0) {
                        if (typeof limpiarAnimacionesEscala === 'function') {
                            limpiarAnimacionesEscala(animFbx.animations);
                        }
                        const action = jugadorRemoto.mixer.clipAction(animFbx.animations[0]);
                        jugadorRemoto.animaciones.disparar = action;

                        console.log(`   ✅ Animación cargada, reproduciendo...`);
                        // Reproducir animación
                        reproducirAnimacionDisparoRemoto(jugadorRemoto);
                    } else {
                        console.warn(`   ⚠️ FBX cargado pero sin animaciones`);
                    }
                });
            }
        } else if (jugadorRemoto.animaciones.disparar) {
            // Si ya está cargada, reproducirla directamente
            console.log(`   ▶️ Reproduciendo animación ya cargada...`);
            reproducirAnimacionDisparoRemoto(jugadorRemoto);
        } else {
            console.warn(`   ⚠️ No se puede cargar/reproducir la animación de disparo`);
        }
    } else {
        if (!jugadorRemoto) console.warn(`   ⚠️ Jugador remoto no encontrado en el Map`);
        if (jugadorRemoto && !jugadorRemoto.mixer) console.warn(`   ⚠️ Jugador remoto no tiene mixer`);
    }

    // Calcular cuánto tiempo ha pasado desde el disparo real (lag compensation visual)
    const ahora = Date.now();
    const tiempoTranscurrido = (ahora - data.timestamp) / 1000; // en segundos
    const MARGEN_MAX = 0.2; // Máximo 200ms de compensación para evitar saltos locos
    const compensar = Math.min(tiempoTranscurrido, MARGEN_MAX);

    // Crear vector de origen y dirección
    const origen = new THREE.Vector3(data.origenX, data.origenY, data.origenZ);
    const direccion = new THREE.Vector3(data.direccionX, data.direccionY, data.direccionZ);

    // Adelantar posición del proyectil según el lag
    const velocidadBala = 45; // Debe coincidir con pool.js
    if (compensar > 0) {
        origen.addScaledVector(direccion, velocidadBala * compensar);
    }

    // Crear proyectil visual (owner = 3 para indicar que es remoto)
    projectilePool.acquire(3, origen, direccion);

    // Flash de disparo remoto (color naranja/rojo para diferenciar)
    const flash = new THREE.PointLight(0xff4400, 4, 10);
    flash.position.set(data.origenX, data.origenY, data.origenZ);
    if (typeof escena !== 'undefined') {
        escena.add(flash);
        setTimeout(() => escena.remove(flash), 50);
    }
}

// Función auxiliar para reproducir animación de disparo
function reproducirAnimacionDisparoRemoto(jugadorRemoto) {
    const animsBase = [];
    if (jugadorRemoto.animaciones.caminar) animsBase.push(jugadorRemoto.animaciones.caminar);
    if (jugadorRemoto.animaciones.parado) animsBase.push(jugadorRemoto.animaciones.parado);
    if (jugadorRemoto.animaciones.agachado) animsBase.push(jugadorRemoto.animaciones.agachado);

    // Reducir peso de otras animaciones
    animsBase.forEach(a => {
        if (a) a.setEffectiveWeight(0.1);
    });

    // Mostrar arma durante disparo
    if (jugadorRemoto.armaObj) {
        jugadorRemoto.armaObj.visible = true;
    }

    // Reproducir animación de disparo
    const disparoAction = jugadorRemoto.animaciones.disparar;
    disparoAction.stop();
    disparoAction.reset();
    disparoAction.setEffectiveWeight(1.0);
    disparoAction.setEffectiveTimeScale(1.8);
    disparoAction.play();

    console.log(`🎬 Animación de disparo reproducida para jugador remoto: ${jugadorRemoto.id}`);

    // Restaurar pesos después de la animación
    setTimeout(() => {
        animsBase.forEach(a => {
            if (a) a.setEffectiveWeight(1.0);
        });

        if (disparoAction) {
            disparoAction.fadeOut(0.2);
        }

        // Restaurar visibilidad según estado
        if (jugadorRemoto.armaObj) {
            const moviendo = jugadorRemoto.animacionActual === 'caminar';
            const agachado = jugadorRemoto.animacionActual === 'agachado';
            jugadorRemoto.armaObj.visible = moviendo && !agachado;
        }
    }, 450);
}

// ========================================
// UTILIDADES
// ========================================

function medirLatencia(callback) {
    if (!socket?.connected) {
        if (callback) callback(-1);
        return;
    }

    ultimoPing = Date.now();
    socket.emit('ping', () => {
        latenciaActual = Date.now() - ultimoPing;
        console.log(`📡 Latencia: ${latenciaActual}ms`);
        if (callback) callback(latenciaActual);
    });
}

function obtenerLatencia() {
    return latenciaActual;
}

function estaConectado() {
    return socket?.connected || false;
}

function obtenerSalaActual() {
    return salaActual;
}

function obtenerMiId() {
    return miSocketId;
}

function desconectar() {
    if (socket) {
        socket.disconnect();
        modoMultijugador = false;
        salaActual = null;
    }
}

// ========================================
// PANTALLA DE RESULTADOS
// ========================================

function mostrarResultadoPartida(esGanador, data) {
    juegoTerminado = true;
    activo = false;
    document.exitPointerLock();

    // Crear o mostrar modal de resultados
    let modal = document.getElementById('modal-resultados');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-resultados';
        modal.className = 'absolute inset-0 flex items-center justify-center bg-black/90 z-[60]';
        document.body.appendChild(modal);
    }

    const titulo = esGanador ? '🏆 ¡VICTORIA SIUM!' : '☠️ ELIMINADO';
    const colorTitulo = esGanador ? 'text-yellow-400' : 'text-red-600';
    const submensaje = esGanador ? 'Has dominado la arena.' : `Asesino: ${data.asesinoId || 'Desconocido'}`;

    modal.innerHTML = `
        <div class="glass p-12 text-center max-w-lg w-full border-2 ${esGanador ? 'border-yellow-500' : 'border-red-500'}">
            <h1 class="text-6xl font-black italic tracking-tighter mb-4 ${colorTitulo} animate-bounce">${titulo}</h1>
            <p class="text-zinc-400 text-xl mb-8 uppercase tracking-widest">${submensaje}</p>
            
            <div class="grid grid-cols-2 gap-4 mb-8">
                <div class="bg-zinc-900/50 p-4 rounded">
                    <p class="text-xs text-zinc-500 uppercase">Ganador</p>
                    <p class="text-white font-bold">${data.ganadorId === miSocketId ? 'TÚ' : 'OPONENTE'}</p>
                </div>
                <div class="bg-zinc-900/50 p-4 rounded">
                    <p class="text-xs text-zinc-500 uppercase">Personaje</p>
                    <p class="text-white font-bold">${data.ganadorPersonaje || 'Siumer'}</p>
                </div>
            </div>

            <button onclick="location.reload()" 
                class="w-full bg-white text-black font-black py-4 uppercase tracking-widest hover:bg-zinc-200 transition-colors">
                Volver al Menú Principal
            </button>
        </div>
    `;

    modal.classList.remove('hidden');

    // Ocultar HUD
    const hud = document.getElementById('hud-juego');
    if (hud) hud.classList.add('hidden');
}

function actualizarHUD() {
    const barraVida = document.getElementById('barra-vida-jugador');
    const textoHP = document.getElementById('hp-texto');

    if (barraVida) {
        barraVida.style.width = `${vidaJugador}%`;
        // Cambiar color según vida
        if (vidaJugador < 30) barraVida.style.backgroundColor = '#ef4444';
        else if (vidaJugador < 60) barraVida.style.backgroundColor = '#f59e0b';
        else barraVida.style.backgroundColor = '#22c55e';
    }
    if (textoHP) {
        textoHP.textContent = `${Math.ceil(vidaJugador)} HP`;
    }
}
