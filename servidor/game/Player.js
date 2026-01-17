/**
 * SIUM DUEL - Clase Player
 * Representa un jugador conectado al servidor
 */

class Player {
    constructor(socketId, nombre = 'Jugador') {
        this.id = socketId;
        this.nombre = nombre;
        this.personaje = 'agente';

        // Posición y rotación
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.rotY = 0;

        // Estado
        this.vida = 100;
        this.vivo = true;
        this.listo = false;

        // Sala actual
        this.salaId = null;

        // Timestamps para lag compensation
        this.historialPosiciones = [];
        this.maxHistorial = 60; // ~1 segundo a 60 updates/seg
    }

    actualizarPosicion(x, y, z, rotY) {
        // Guardar en historial para lag compensation
        this.historialPosiciones.push({
            x: this.x,
            y: this.y,
            z: this.z,
            rotY: this.rotY,
            timestamp: Date.now()
        });

        // Limitar tamaño del historial
        if (this.historialPosiciones.length > this.maxHistorial) {
            this.historialPosiciones.shift();
        }

        // Actualizar posición actual
        this.x = x;
        this.y = y;
        this.z = z;
        this.rotY = rotY;
    }

    recibirDano(cantidad) {
        this.vida = Math.max(0, this.vida - cantidad);
        if (this.vida <= 0) {
            this.vivo = false;
        }
        return this.vida;
    }

    reiniciar(spawnX = 0, spawnZ = 0) {
        this.x = spawnX;
        this.y = 0;
        this.z = spawnZ;
        this.vida = 100;
        this.vivo = true;
        this.historialPosiciones = [];
    }

    toJSON() {
        return {
            id: this.id,
            nombre: this.nombre,
            personaje: this.personaje,
            x: this.x,
            y: this.y,
            z: this.z,
            rotY: this.rotY,
            vida: this.vida,
            vivo: this.vivo,
            listo: this.listo
        };
    }

    // Obtener posición en un timestamp pasado (para lag compensation)
    getPosicionEnTiempo(timestamp) {
        for (let i = this.historialPosiciones.length - 1; i >= 0; i--) {
            if (this.historialPosiciones[i].timestamp <= timestamp) {
                return this.historialPosiciones[i];
            }
        }
        return { x: this.x, y: this.y, z: this.z, rotY: this.rotY };
    }
}

module.exports = Player;
