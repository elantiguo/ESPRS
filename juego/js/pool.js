// ========================================
// OBJECT POOL PARA PROYECTILES
// ========================================
// Reutiliza meshes de proyectiles en lugar de crear/destruir

class ProjectilePool {
    // CB-62: Pool más pequeño en móviles para reducir iteraciones
    constructor(size = null) {
        this.pool = [];
        this.activeProjectiles = [];
        this.poolSize = size !== null ? size : (esDispositivoTactil ? 10 : 30);
        this._updateCounter = 0; // CB-63: Contador para skip de frames

        // Pre-crear proyectiles
        this.init();
    }

    init() {
        const geoBala = new THREE.SphereGeometry(0.12, 8, 8);

        // Material para jugador (amarillo)
        this.matJugador = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        // Material para bot (rojo)
        this.matBot = new THREE.MeshBasicMaterial({ color: 0xff0000 });

        for (let i = 0; i < this.poolSize; i++) {
            const bala = new THREE.Mesh(geoBala, this.matJugador.clone());
            bala.visible = false;

            // Luz de la bala (Optimización: No crear en móvil si es posible, o dejar visible false)
            let luzBala = null;
            if (!esDispositivoTactil) {
                luzBala = new THREE.PointLight(0xffff00, 1.5, 6);
                luzBala.visible = false;
                bala.add(luzBala);
            }

            // Agregar a escena (invisible)
            escena.add(bala);

            this.pool.push({
                mesh: bala,
                luz: luzBala,
                dir: new THREE.Vector3(),
                owner: 0,
                dist: 0,
                active: false
            });
        }
    }

    // Obtener un proyectil del pool
    acquire(owner, position, direction) {
        // Buscar proyectil inactivo
        let projectile = null;
        for (let i = 0; i < this.pool.length; i++) {
            if (!this.pool[i].active) {
                projectile = this.pool[i];
                break;
            }
        }

        // Si no hay disponibles, reutilizar el más viejo
        if (!projectile && this.activeProjectiles.length > 0) {
            projectile = this.activeProjectiles.shift();
        }

        if (!projectile) return null;

        // Configurar proyectil
        projectile.active = true;
        projectile.owner = owner;
        projectile.dist = 0;
        projectile.dir.copy(direction);

        // Posicionar
        projectile.mesh.position.copy(position);
        projectile.mesh.visible = true;

        // Color según owner
        const color = owner === 1 ? 0xffff00 : 0xff0000;
        projectile.mesh.material.color.setHex(color);
        if (projectile.luz) {
            projectile.luz.color.setHex(color);
            projectile.luz.visible = true;
        }

        this.activeProjectiles.push(projectile);
        return projectile;
    }

    // Devolver proyectil al pool
    release(projectile) {
        projectile.active = false;
        projectile.mesh.visible = false;
        if (projectile.luz) projectile.luz.visible = false;

        // Remover de activos
        const index = this.activeProjectiles.indexOf(projectile);
        if (index > -1) {
            this.activeProjectiles.splice(index, 1);
        }
    }

    // Actualizar todos los proyectiles activos
    update(dt, checkCollision) {
        // CB-63: En móviles, solo procesar colisiones cada 2 frames
        this._updateCounter++;
        const shouldCheckCollision = !esDispositivoTactil || (this._updateCounter % 2 === 0);

        const velocidadBala = 45 * dt;

        for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
            const p = this.activeProjectiles[i];

            // Mover (siempre)
            p.mesh.position.x += p.dir.x * velocidadBala;
            p.mesh.position.y += p.dir.y * velocidadBala;
            p.mesh.position.z += p.dir.z * velocidadBala;
            p.dist += velocidadBala;

            // Rango máximo (check rápido primero)
            if (p.dist > 60) {
                this.release(p);
                continue;
            }

            // Colisión con paredes (solo cada 2 frames en móvil)
            if (shouldCheckCollision) {
                const balaBaja = p.mesh.position.y < 1.8;
                if (colision(p.mesh.position.x, p.mesh.position.z, balaBaja)) {
                    this.release(p);
                    continue;
                }

                // Colisión con personajes
                if (checkCollision(p)) {
                    this.release(p);
                    continue;
                }
            }
        }
    }

    // Limpiar todos los proyectiles (al finalizar juego)
    clear() {
        for (const p of this.activeProjectiles) {
            p.active = false;
            p.mesh.visible = false;
            if (p.luz) p.luz.visible = false;
        }
        this.activeProjectiles = [];
    }

    // Obtener proyectiles activos (para el bot esquivar)
    getActive() {
        return this.activeProjectiles;
    }
}


// ========================================
// POOL PARA DESTELLOS (FLASH) DE DISPARO
// ========================================
class FlashPool {
    constructor(size = 5) {
        this.flashes = [];
        // CB-64: Sin flashes en móviles (luces extra causan lag)
        if (esDispositivoTactil) {
            this.disabled = true;
            return;
        }
        this.disabled = false;
        for (let i = 0; i < size; i++) {
            const flash = new THREE.PointLight(0xffff00, 3, 10);
            flash.visible = false;
            escena.add(flash);
            this.flashes.push({ light: flash, active: false });
        }
    }

    show(position, color = 0xffff00, duration = 50) {
        if (this.disabled) return; // CB-64: Skip en móviles
        const flash = this.flashes.find(f => !f.active) || this.flashes[0];
        if (!flash) return;
        flash.active = true;
        flash.light.position.copy(position);
        flash.light.color.setHex(color);
        flash.light.visible = true;

        setTimeout(() => {
            flash.light.visible = false;
            flash.active = false;
        }, duration);
    }
}

var flashPool = null;

function inicializarProjectilePool() {
    projectilePool = new ProjectilePool(30);
    flashPool = new FlashPool(5);
}
