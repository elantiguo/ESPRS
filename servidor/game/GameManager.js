/**
 * SIUM DUEL - GameManager
 * Gestiona todas las salas y el estado global del servidor
 */

const Room = require('./Room');
const Player = require('./Player');

class GameManager {
    constructor() {
        this.salas = new Map();      // id -> Room
        this.jugadores = new Map();  // socketId -> Player

        // Estadísticas del servidor
        this.stats = {
            totalConexiones: 0,
            partidasJugadas: 0,
            tiempoInicio: Date.now()
        };
    }

    // ========================================
    // GESTIÓN DE JUGADORES
    // ========================================

    conectarJugador(socketId, nombre = 'Jugador') {
        const player = new Player(socketId, nombre);
        this.jugadores.set(socketId, player);
        this.stats.totalConexiones++;


        return player;
    }

    desconectarJugador(socketId) {
        const player = this.jugadores.get(socketId);

        if (player) {
            // Si estaba en una sala, removerlo
            if (player.salaId) {
                const sala = this.salas.get(player.salaId);
                if (sala) {
                    const restantes = sala.removerJugador(socketId);

                    // Si la sala quedó vacía, eliminarla
                    if (restantes === 0) {
                        this.salas.delete(sala.id);

                    }
                }
            }

            this.jugadores.delete(socketId);

        }

        return player;
    }

    obtenerJugador(socketId) {
        return this.jugadores.get(socketId);
    }

    // ========================================
    // GESTIÓN DE SALAS
    // ========================================

    crearSala(hostId, nombre = 'Sala SIUM') {
        const host = this.jugadores.get(hostId);
        if (!host) {
            return { exito: false, error: 'Jugador no encontrado' };
        }

        // Si ya está en una sala, salir primero
        if (host.salaId) {
            this.salirDeSala(hostId);
        }

        const sala = new Room(hostId, nombre);
        sala.agregarJugador(host);
        this.salas.set(sala.id, sala);



        return { exito: true, sala: sala.toJSON() };
    }

    unirseASala(playerId, codigoSala) {
        const player = this.jugadores.get(playerId);
        if (!player) {
            return { exito: false, error: 'Jugador no encontrado' };
        }

        const sala = this.salas.get(codigoSala);
        if (!sala) {
            return { exito: false, error: 'Sala no encontrada' };
        }

        // Si ya está en una sala, salir primero
        if (player.salaId) {
            this.salirDeSala(playerId);
        }

        const resultado = sala.agregarJugador(player);

        if (resultado.exito) {

        }

        return { ...resultado, sala: sala.toJSON() };
    }

    salirDeSala(playerId) {
        const player = this.jugadores.get(playerId);
        if (!player || !player.salaId) {
            return { exito: false };
        }

        const sala = this.salas.get(player.salaId);
        if (sala) {
            const restantes = sala.removerJugador(playerId);

            if (restantes === 0) {
                this.salas.delete(sala.id);

            }


            return { exito: true, salaId: sala.id, restantes };
        }

        return { exito: false };
    }

    obtenerSala(salaId) {
        return this.salas.get(salaId);
    }

    listarSalasDisponibles() {
        const disponibles = [];

        for (const [id, sala] of this.salas) {
            if (!sala.estaLlena() && sala.estado === 'ESPERANDO') {
                disponibles.push({
                    id: sala.id,
                    nombre: sala.nombre,
                    jugadores: sala.jugadores.size,
                    maxJugadores: sala.maxJugadores
                });
            }
        }

        return disponibles;
    }

    // ========================================
    // GESTIÓN DE PARTIDAS
    // ========================================

    marcarListo(playerId, listo = true) {
        const player = this.jugadores.get(playerId);
        if (!player || !player.salaId) {
            return { exito: false };
        }

        player.listo = listo;

        const sala = this.salas.get(player.salaId);

        return {
            exito: true,
            todosListos: sala ? sala.todosListos() : false,
            sala: sala ? sala.toJSON() : null
        };
    }

    iniciarPartida(salaId) {
        const sala = this.salas.get(salaId);
        if (!sala) {
            return { exito: false, error: 'Sala no encontrada' };
        }

        const resultado = sala.iniciarPartida();

        if (resultado.exito) {
            this.stats.partidasJugadas++;

        }

        return { ...resultado, sala: sala.toJSON() };
    }

    // ========================================
    // ESTADÍSTICAS
    // ========================================

    obtenerEstadisticas() {
        return {
            ...this.stats,
            jugadoresActivos: this.jugadores.size,
            salasActivas: this.salas.size,
            uptimeMinutos: Math.floor((Date.now() - this.stats.tiempoInicio) / 60000)
        };
    }
}

module.exports = GameManager;
