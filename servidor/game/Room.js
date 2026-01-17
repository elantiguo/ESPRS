/**
 * SIUM DUEL - Clase Room
 * Representa una sala de juego donde compiten los jugadores
 */

const { v4: uuidv4 } = require('uuid');

class Room {
    constructor(hostId, nombre = 'Sala SIUM') {
        this.id = this.generarCodigo();
        this.nombre = nombre;
        this.hostId = hostId;

        // Jugadores en la sala
        this.jugadores = new Map();
        this.maxJugadores = 2; // Por ahora 1v1

        // Estado de la sala
        this.estado = 'ESPERANDO'; // ESPERANDO, INICIANDO, EN_JUEGO, FINALIZADO
        this.tiempoCreacion = Date.now();

        // Configuración del juego
        this.configuracion = {
            tiempoRonda: 120,    // segundos
            vidaInicial: 100,
            danoProyectil: 20,
            dimensionMapa: 9,   // Dimensión del laberinto
            escalaMapa: 6        // Escala del mundo (debe coincidir con cliente)
        };

        // Estado del juego activo
        this.tiempoRestante = 0;
        this.intervaloJuego = null;

        // Mapa generado para esta sala
        this.mapa = null;
    }

    generarCodigo() {
        // Código corto de 6 caracteres para compartir
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    agregarJugador(player) {
        if (this.jugadores.size >= this.maxJugadores) {
            return { exito: false, error: 'Sala llena' };
        }

        if (this.estado !== 'ESPERANDO') {
            return { exito: false, error: 'Partida en curso' };
        }

        player.salaId = this.id;
        this.jugadores.set(player.id, player);

        return { exito: true };
    }

    removerJugador(playerId) {
        const player = this.jugadores.get(playerId);
        if (player) {
            player.salaId = null;
            this.jugadores.delete(playerId);

            // Si se fue el host, asignar nuevo host
            if (playerId === this.hostId && this.jugadores.size > 0) {
                this.hostId = this.jugadores.keys().next().value;
            }
        }

        return this.jugadores.size;
    }

    estaLlena() {
        return this.jugadores.size >= this.maxJugadores;
    }

    todosListos() {
        if (this.jugadores.size < 2) return false;

        for (const [id, player] of this.jugadores) {
            if (!player.listo) return false;
        }
        return true;
    }

    iniciarPartida() {
        if (!this.todosListos()) {
            return { exito: false, error: 'No todos están listos' };
        }

        this.estado = 'INICIANDO';
        this.tiempoRestante = this.configuracion.tiempoRonda;

        // IMPORTANTE: Generar el mapa para esta sala
        this.generarMapa();

        // Cambiar a EN_JUEGO después de la cinemática (10s countdown + 6s recorrido = 16s aprox)
        // Usamos un margen de 12s para el countdown inicial por ahora
        setTimeout(() => {
            if (this.estado === 'INICIANDO') {
                this.estado = 'EN_JUEGO';
                console.log(`⚔️ [Room] Sala ${this.id} ahora en estado EN_JUEGO`);
            }
        }, 12000);

        // Reiniciar jugadores
        const spawns = this.obtenerSpawns();
        let i = 0;
        for (const [id, player] of this.jugadores) {
            player.reiniciar(spawns[i].x, spawns[i].z);
            i++;
        }

        return { exito: true };
    }

    obtenerSpawns() {
        const DIMENSION = this.configuracion.dimensionMapa;
        const ESCALA = this.configuracion.escalaMapa;
        const offset = (DIMENSION * ESCALA) / 2;

        // Posiciones de spawn en esquinas opuestas del laberinto
        // (1,1) y (DIM-2, DIM-2) son pasillos garantizados por el algoritmo
        return [
            { x: 1 * ESCALA - offset, z: 1 * ESCALA - offset },
            { x: (DIMENSION - 2) * ESCALA - offset, z: (DIMENSION - 2) * ESCALA - offset }
        ];
    }

    /**
     * Genera el mapa del laberinto para esta sala
     * Usa el mismo algoritmo que el cliente para consistencia
     */
    generarMapa() {
        const DIMENSION = this.configuracion.dimensionMapa;
        const mapa = [];

        // Inicializar con paredes
        for (let y = 0; y < DIMENSION; y++) {
            mapa[y] = [];
            for (let x = 0; x < DIMENSION; x++) {
                mapa[y][x] = 1;
            }
        }

        // Usar una semilla basada en el ID de la sala para consistencia
        let seed = 0;
        for (let i = 0; i < this.id.length; i++) {
            seed += this.id.charCodeAt(i);
        }

        // Generador de números pseudoaleatorios con semilla
        const seededRandom = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };

        // Algoritmo de excavación recursiva
        const excavar = (x, y) => {
            mapa[y][x] = 0;
            const direcciones = [[0, 2], [0, -2], [2, 0], [-2, 0]];

            // Mezclar direcciones usando seededRandom
            for (let i = direcciones.length - 1; i > 0; i--) {
                const j = Math.floor(seededRandom() * (i + 1));
                [direcciones[i], direcciones[j]] = [direcciones[j], direcciones[i]];
            }

            for (let [dx, dy] of direcciones) {
                let nx = x + dx;
                let ny = y + dy;
                if (nx > 0 && nx < DIMENSION - 1 && ny > 0 && ny < DIMENSION - 1 && mapa[ny][nx] === 1) {
                    mapa[y + dy / 2][x + dx / 2] = 0;
                    excavar(nx, ny);
                }
            }
        };

        excavar(1, 1);

        // Generación de huecos (agacharse)
        for (let y = 1; y < DIMENSION - 1; y++) {
            for (let x = 1; x < DIMENSION - 1; x++) {
                if (mapa[y][x] === 1 && seededRandom() < 0.15) {
                    const horiz = mapa[y][x - 1] === 0 && mapa[y][x + 1] === 0;
                    const vert = mapa[y - 1][x] === 0 && mapa[y + 1][x] === 0;
                    if (horiz || vert) {
                        mapa[y][x] = 2;
                    }
                }
            }
        }

        this.mapa = mapa;
        console.log(`🗺️ [Room] Mapa generado para sala ${this.id}`);
        return mapa;
    }


    tick() {
        if (this.estado !== 'EN_JUEGO') return;

        this.tiempoRestante--;

        // Verificar condiciones de victoria
        const vivos = Array.from(this.jugadores.values()).filter(p => p.vivo);

        if (vivos.length <= 1 || this.tiempoRestante <= 0) {
            this.finalizarPartida(vivos[0] || null);
        }
    }

    finalizarPartida(ganador) {
        this.estado = 'FINALIZADO';

        if (this.intervaloJuego) {
            clearInterval(this.intervaloJuego);
            this.intervaloJuego = null;
        }

        return {
            ganadorId: ganador ? ganador.id : null,
            ganadorNombre: ganador ? ganador.nombre : 'Empate'
        };
    }

    reiniciarSala() {
        this.estado = 'ESPERANDO';
        this.tiempoRestante = 0;

        for (const [id, player] of this.jugadores) {
            player.listo = false;
            player.reiniciar();
        }
    }

    toJSON() {
        return {
            id: this.id,
            nombre: this.nombre,
            hostId: this.hostId,
            estado: this.estado,
            jugadores: Array.from(this.jugadores.values()).map(p => p.toJSON()),
            maxJugadores: this.maxJugadores,
            tiempoRestante: this.tiempoRestante,
            configuracion: this.configuracion
        };
    }
}

module.exports = Room;
