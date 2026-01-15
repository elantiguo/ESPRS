// ========================================
// OBJECT POOL PARA PROYECTILES
// ========================================
// Reutiliza meshes de proyectiles en lugar de crear/destruir

class ProjectilePool {
    constructor(size = 30) {
        this.pool = [];
        this.activeProjectiles = [];
        this.poolSize = size;

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

            // Luz de la bala
            const luzBala = new THREE.PointLight(0xffff00, 1.5, 6);
            luzBala.visible = false;
            bala.add(luzBala);

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
        projectile.luz.color.setHex(color);
        projectile.luz.visible = true;

        this.activeProjectiles.push(projectile);
        return projectile;
    }

    // Devolver proyectil al pool
    release(projectile) {
        projectile.active = false;
        projectile.mesh.visible = false;
        projectile.luz.visible = false;

        // Remover de activos
        const index = this.activeProjectiles.indexOf(projectile);
        if (index > -1) {
            this.activeProjectiles.splice(index, 1);
        }
    }

    // Actualizar todos los proyectiles activos
    update(dt, checkCollision) {
        const velocidadBala = 45 * dt;

        for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
            const p = this.activeProjectiles[i];

            // Mover
            p.mesh.position.addScaledVector(p.dir, velocidadBala);
            p.dist += velocidadBala;

            // Colisión con paredes
            const balaBaja = p.mesh.position.y < 1.8;
            if (colision(p.mesh.position.x, p.mesh.position.z, balaBaja)) {
                this.release(p);
                continue;
            }

            // Colisión con personajes (usando callback)
            if (checkCollision(p)) {
                this.release(p);
                continue;
            }

            // Rango máximo
            if (p.dist > 60) {
                this.release(p);
            }
        }
    }

    // Limpiar todos los proyectiles (al finalizar juego)
    clear() {
        for (const p of this.activeProjectiles) {
            p.active = false;
            p.mesh.visible = false;
            p.luz.visible = false;
        }
        this.activeProjectiles = [];
    }

    // Obtener proyectiles activos (para el bot esquivar)
    getActive() {
        return this.activeProjectiles;
    }
}

// Variable global del pool
var projectilePool = null;

function inicializarProjectilePool() {
    projectilePool = new ProjectilePool(30);
}
