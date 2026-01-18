/**
 * SIUM DUEL - SocketHandler
 * Maneja todos los eventos de Socket.IO
 */

class SocketHandler {
    constructor(io, gameManager) {
        this.io = io;
        this.gameManager = gameManager;

        this.configurarEventos();
    }

    configurarEventos() {

        this.io.on('connection', (socket) => {


            // Registrar jugador al conectar
            const player = this.gameManager.conectarJugador(socket.id);

            // Enviar confirmación de conexión
            socket.emit('conexion:exitosa', {
                id: socket.id,
                mensaje: 'Conectado a SIUM DUEL Server'
            });

            // ========================================
            // EVENTOS DE SALA
            // ========================================

            // Crear sala
            socket.on('sala:crear', (data, callback) => {
                const resultado = this.gameManager.crearSala(socket.id, data?.nombre);

                if (resultado.exito) {
                    socket.join(resultado.sala.id);
                }

                if (callback) callback(resultado);
            });

            // Unirse a sala
            socket.on('sala:unirse', (data, callback) => {
                const resultado = this.gameManager.unirseASala(socket.id, data.codigo);

                if (resultado.exito) {
                    socket.join(resultado.sala.id);

                    // Notificar a otros en la sala
                    socket.to(resultado.sala.id).emit('sala:jugadorUnido', {
                        jugador: player.toJSON(),
                        sala: resultado.sala
                    });
                }

                if (callback) callback(resultado);
            });

            // Salir de sala
            socket.on('sala:salir', (callback) => {
                const player = this.gameManager.obtenerJugador(socket.id);
                const salaId = player?.salaId;

                if (salaId) {
                    const sala = this.gameManager.obtenerSala(salaId);

                    // Si sale durante la partida
                    if (sala && (sala.estado === 'INICIANDO' || sala.estado === 'EN_JUEGO')) {
                        const restantes = Array.from(sala.jugadores.values()).filter(p => p.id !== socket.id);

                        if (restantes.length === 1) {
                            const ganador = restantes[0];
                            sala.finalizarPartida(ganador);

                            this.io.to(salaId).emit('partida:finalizada', {
                                ganadorId: ganador.id,
                                ganadorNombre: ganador.nombre,
                                ganadorPersonaje: ganador.personaje,
                                razon: 'abandono'
                            });
                        }
                    }

                    const resultado = this.gameManager.salirDeSala(socket.id);
                    socket.leave(salaId);

                    // Notificar a otros en la sala
                    this.io.to(salaId).emit('sala:jugadorSalio', {
                        jugadorId: socket.id
                    });

                    if (callback) callback(resultado);
                }
            });

            // Listar salas disponibles
            socket.on('sala:listar', (callback) => {
                const salas = this.gameManager.listarSalasDisponibles();
                if (callback) callback({ salas });
            });

            // Marcar listo
            socket.on('sala:listo', (data, callback) => {
                const resultado = this.gameManager.marcarListo(socket.id, data?.listo ?? true);

                if (resultado.exito && resultado.sala) {
                    // Notificar a todos en la sala
                    this.io.to(resultado.sala.id).emit('sala:actualizada', {
                        sala: resultado.sala
                    });

                    // Si todos están listos, notificar
                    if (resultado.todosListos) {
                        this.io.to(resultado.sala.id).emit('sala:todosListos');
                    }
                }

                if (callback) callback(resultado);
            });

            // Iniciar partida (solo host)
            socket.on('partida:iniciar', (callback) => {
                const player = this.gameManager.obtenerJugador(socket.id);
                if (!player?.salaId) {
                    if (callback) callback({ exito: false, error: 'No estás en una sala' });
                    return;
                }

                const sala = this.gameManager.obtenerSala(player.salaId);
                if (!sala || sala.hostId !== socket.id) {
                    if (callback) callback({ exito: false, error: 'Solo el host puede iniciar' });
                    return;
                }

                const resultado = this.gameManager.iniciarPartida(player.salaId);

                if (resultado.exito) {
                    // Enviar el mapa generado a todos los jugadores
                    this.io.to(player.salaId).emit('partida:iniciando', {
                        sala: resultado.sala,
                        mapa: sala.mapa  // ¡IMPORTANTE! Enviar el mapa
                    });
                }

                if (callback) callback(resultado);
            });

            // Reportar que el cliente terminó de cargar
            socket.on('partida:cargado', () => {
                const player = this.gameManager.obtenerJugador(socket.id);
                if (!player?.salaId) return;

                const sala = this.gameManager.obtenerSala(player.salaId);
                if (!sala) return;

                const todosCargados = sala.marcarJugadorCargado(socket.id);

                if (todosCargados) {
                    // Notificar a todos que la partida puede iniciar (conteo cinematográfico)
                    this.io.to(sala.id).emit('partida:iniciarConteo');
                }
            });

            // ========================================
            // EVENTOS DE JUEGO
            // ========================================

            // Actualizar posición
            socket.on('jugador:mover', (data) => {
                const player = this.gameManager.obtenerJugador(socket.id);
                if (!player) return;

                player.actualizarPosicion(data.x, data.y, data.z, data.rotY);

                // Reenviar a otros en la sala
                if (player.salaId) {
                    socket.to(player.salaId).emit('jugador:movio', {
                        id: socket.id,
                        x: data.x,
                        y: data.y,
                        z: data.z,
                        rotY: data.rotY,
                        animacion: data.animacion
                    });
                }
            });

            // Disparar
            socket.on('jugador:disparar', (data) => {
                const player = this.gameManager.obtenerJugador(socket.id);
                if (!player?.salaId) return;



                // Reenviar disparo a todos en la sala
                socket.to(player.salaId).emit('jugador:disparo', {
                    id: socket.id,
                    origenX: data.origenX,
                    origenY: data.origenY,
                    origenZ: data.origenZ,
                    direccionX: data.direccionX,
                    direccionY: data.direccionY,
                    direccionZ: data.direccionZ,
                    timestamp: data.timestamp
                });
            });

            // Reportar impacto (el servidor valida)
            socket.on('jugador:impacto', (data) => {
                const atacante = this.gameManager.obtenerJugador(socket.id);
                const victima = this.gameManager.obtenerJugador(data.victimaId);

                if (!atacante?.salaId || !victima) return;
                if (atacante.salaId !== victima.salaId) return; // Deben estar en la misma sala
                if (!victima.vivo) return; // Ya está muerto

                // ========================================
                // CB-20: VALIDACIÓN DE DISTANCIA OPTIMIZADA
                // ========================================
                // Usar distancia al cuadrado para evitar Math.sqrt()
                const dx = atacante.x - victima.x;
                const dz = atacante.z - victima.z;
                const distanciaSq = dx * dx + dz * dz;

                // Distancia máxima de disparo válido (100 unidades)
                const DISTANCIA_MAX_SQ = 100 * 100; // 10000
                if (distanciaSq > DISTANCIA_MAX_SQ) {

                    return;
                }

                // Aplicar daño
                const dano = data.dano || 20;
                const vidaRestante = victima.recibirDano(dano);



                // Notificar a todos en la sala
                this.io.to(atacante.salaId).emit('jugador:danado', {
                    victimaId: data.victimaId,
                    atacanteId: socket.id,
                    dano: dano,
                    vidaRestante: vidaRestante
                });

                // Si murió
                if (!victima.vivo) {


                    this.io.to(atacante.salaId).emit('jugador:murio', {
                        jugadorId: data.victimaId,
                        asesinoId: socket.id
                    });

                    // Verificar fin de partida
                    const sala = this.gameManager.obtenerSala(atacante.salaId);
                    if (sala) {
                        const jugadoresVivos = Array.from(sala.jugadores.values()).filter(p => p.vivo);

                        if (jugadoresVivos.length <= 1) {
                            // Partida terminada
                            const ganador = jugadoresVivos[0] || atacante;
                            sala.finalizarPartida(ganador);



                            this.io.to(atacante.salaId).emit('partida:finalizada', {
                                ganadorId: ganador.id,
                                ganadorPersonaje: ganador.personaje,
                                razon: 'eliminacion'
                            });
                        }
                    }
                }
            });

            // Seleccionar personaje
            socket.on('jugador:personaje', (data) => {
                const player = this.gameManager.obtenerJugador(socket.id);
                if (player) {
                    player.personaje = data.personaje;

                    if (player.salaId) {
                        socket.to(player.salaId).emit('jugador:cambioPersonaje', {
                            jugadorId: socket.id,
                            personaje: data.personaje
                        });
                    }
                }
            });

            // ========================================
            // UTILIDADES
            // ========================================

            // Ping/Pong para latencia
            socket.on('ping', (callback) => {
                if (callback) callback();
            });

            // Obtener estadísticas del servidor
            socket.on('servidor:stats', (callback) => {
                if (callback) callback(this.gameManager.obtenerEstadisticas());
            });

            // ========================================
            // DESCONEXIÓN
            // ========================================

            socket.on('disconnect', () => {
                const player = this.gameManager.obtenerJugador(socket.id);
                const salaId = player?.salaId;

                if (salaId) {
                    const sala = this.gameManager.obtenerSala(salaId);

                    if (sala) {


                        // Si la partida estaba en curso o iniciando
                        if (sala.estado === 'INICIANDO' || sala.estado === 'EN_JUEGO') {
                            // Obtener todos los jugadores excepto el que se desconecta
                            const jugadoresEnSala = Array.from(sala.jugadores.values());
                            const restantes = jugadoresEnSala.filter(p => p.id !== socket.id);



                            if (restantes.length === 1) {
                                const ganador = restantes[0];
                                sala.finalizarPartida(ganador);



                                this.io.to(salaId).emit('partida:finalizada', {
                                    ganadorId: ganador.id,
                                    ganadorNombre: ganador.nombre,
                                    ganadorPersonaje: ganador.personaje,
                                    razon: 'desconexion'
                                });
                            }
                        }

                        // Notificar a la sala sobre la desconexión
                        this.io.to(salaId).emit('jugador:desconectado', {
                            jugadorId: socket.id
                        });
                    }
                }

                this.gameManager.desconectarJugador(socket.id);

            });
        });
    }
}

module.exports = SocketHandler;
