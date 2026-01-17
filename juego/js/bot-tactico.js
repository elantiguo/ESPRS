// ====================================
// IA TÁCTICA AVANZADA - MOVIMIENTO NATURAL
// ====================================

class BotTactico {
    constructor() {
        // Estados del bot
        this.ESTADOS = {
            PATRULLAR: 'patrullar',
            BUSCAR: 'buscar',
            PERSEGUIR: 'perseguir',
            HUIR: 'huir',
            ESCONDERSE: 'esconderse',
            ATACAR: 'atacar'
        };

        this.estadoActual = this.ESTADOS.PATRULLAR;
        this.ultimaPosJugador = null;
        this.tiempoUltimaVista = 0;
        this.cooldownDisparo = 0;
        this.estaAgachado = false;

        // ========================================
        // SISTEMA DE WAYPOINTS PARA PATRULLAJE
        // ========================================
        this.waypoints = [];
        this.waypointActual = 0;
        this.tiempoEnWaypoint = 0;
        this.tiempoEsperaWaypoint = 1.5; // Segundos de pausa en cada waypoint
        this.waypointGenerado = false;

        // ========================================
        // SISTEMA DE BÚSQUEDA
        // ========================================
        this.puntosVisitados = [];
        this.maxPuntosVisitados = 20;
        this.tiempoBuscando = 0;
        this.duracionBusqueda = 8; // Segundos buscando antes de volver a patrullar

        // ========================================
        // SISTEMA DE ESCONDITE
        // ========================================
        this.puntoEscondite = null;
        this.tiempoEscondido = 0;
        this.duracionEscondite = 3; // Segundos escondido

        // ========================================
        // MOVIMIENTO SUAVE
        // ========================================
        this.direccionActual = { x: 0, z: 0 };
        this.velocidadGiro = 5; // Qué tan rápido gira
        this.tiempoQuieto = 0;
        this.maxTiempoQuieto = 2; // Si está quieto más de 2 seg, cambiar objetivo

        // ========================================
        // SISTEMA DE EVASIÓN DE PROYECTILES
        // ========================================
        this.esquivando = false;
        this.direccionEsquive = { x: 0, z: 0 };
        this.tiempoEsquive = 0;
        this.duracionEsquive = 0.6; // Duración del movimiento de esquive (más largo)
        this.cooldownEsquive = 0;
        this.cooldownEsquiveMax = 0.5; // Tiempo entre esquives (más corto)
        this.rangoDeteccionProyectil = 8; // Detectar más cerca para reaccionar justo a tiempo
        this.probabilidadEsquive = 0.85; // 85% de probabilidad de esquivar

        // Configuración de comportamiento
        this.rangoVision = 25;
        this.rangoDisparo = 18;
        this.rangoAtaque = 8;
        this.tiempoMemoria = 6000;

        // Precisión de disparo
        this.precisionBase = 0.7;
        this.precisionCercana = 0.9;

        // Historial para predicción
        this.historialPosJugador = [];
        this.maxHistorial = 10;

        // ========================================
        // THROTTLE DE DECISIONES (Optimización)
        // ========================================
        this.frameCounter = 0;
        this.visionCheckInterval = 3;    // Verificar visión cada 3 frames
        this.cachedVision = false;       // Resultado cacheado de línea de visión
        this.agachadoCheckInterval = 5;  // Verificar agachado cada 5 frames
        this.cachedDebeAgacharse = false;
        // Posición anterior para detectar si está quieto
        this.posicionAnterior = null;
    }

    reset() {
        this.estadoActual = this.ESTADOS.PATRULLAR;
        this.ultimaPosJugador = null;
        this.tiempoUltimaVista = 0;
        this.cooldownDisparo = 0;
        this.estaAgachado = false;
        this.waypointGenerado = false; // Forzar regeneración si se desea
        this.puntosVisitados = [];
        this.tiempoBuscando = 0;
        this.puntoEscondite = null;
        this.tiempoEscondido = 0;
        this.direccionActual = { x: 0, z: 0 };
        this.tiempoQuieto = 0;
        this.esquivando = false;
        this.cooldownEsquive = 0;
        this.historialPosJugador = [];
        this.posicionAnterior = null;
    }

    // ========================================
    // GENERAR WAYPOINTS DE PATRULLA
    // ========================================

    generarWaypoints(laberintoRef, dimension, escala) {
        if (this.waypointGenerado) return;

        const offset = (dimension * escala) / 2;
        this.waypoints = [];

        // Encontrar todos los pasillos y crear waypoints
        for (let z = 1; z < dimension - 1; z += 3) {
            for (let x = 1; x < dimension - 1; x += 3) {
                if (laberintoRef[z]?.[x] === 0) {
                    // Es un pasillo, añadir como waypoint potencial
                    this.waypoints.push({
                        x: x * escala - offset,
                        z: z * escala - offset
                    });
                }
            }
        }

        // Mezclar waypoints para orden aleatorio
        this.waypoints.sort(() => Math.random() - 0.5);
        this.waypointGenerado = true;
    }

    obtenerSiguienteWaypoint() {
        if (this.waypoints.length === 0) return null;

        this.waypointActual = (this.waypointActual + 1) % this.waypoints.length;
        return this.waypoints[this.waypointActual];
    }

    // ========================================
    // ENCONTRAR PUNTO DE ESCONDITE
    // ========================================

    encontrarEscondite(botPos, jugadorPos, laberintoRef, dimension, escala) {
        const offset = (dimension * escala) / 2;
        let mejorEscondite = null;
        let mejorPuntuacion = -Infinity;

        // Buscar esquinas y callejones sin salida
        for (let z = 1; z < dimension - 1; z++) {
            for (let x = 1; x < dimension - 1; x++) {
                if (laberintoRef[z]?.[x] !== 0) continue;

                // Contar paredes adyacentes (más paredes = mejor escondite)
                let paredes = 0;
                if (laberintoRef[z - 1]?.[x] === 1) paredes++;
                if (laberintoRef[z + 1]?.[x] === 1) paredes++;
                if (laberintoRef[z]?.[x - 1] === 1) paredes++;
                if (laberintoRef[z]?.[x + 1] === 1) paredes++;

                if (paredes >= 2) { // Es una esquina o callejón
                    const worldX = x * escala - offset;
                    const worldZ = z * escala - offset;

                    // Calcular distancia al jugador (queremos lejos)
                    const distJugador = Math.sqrt(
                        Math.pow(worldX - jugadorPos.x, 2) +
                        Math.pow(worldZ - jugadorPos.z, 2)
                    );

                    // Calcular distancia al bot (queremos cerca)
                    const distBot = Math.sqrt(
                        Math.pow(worldX - botPos.x, 2) +
                        Math.pow(worldZ - botPos.z, 2)
                    );

                    // Puntuación: lejos del jugador pero accesible para el bot
                    const puntuacion = distJugador * 2 - distBot + paredes * 5;

                    if (puntuacion > mejorPuntuacion && distBot > 5) {
                        mejorPuntuacion = puntuacion;
                        mejorEscondite = { x: worldX, z: worldZ };
                    }
                }
            }
        }

        return mejorEscondite;
    }

    // ========================================
    // PATRÓN DE BÚSQUEDA EN ESPIRAL
    // ========================================

    generarPuntoBusqueda(centroX, centroZ, radio, angulo) {
        return {
            x: centroX + Math.cos(angulo) * radio,
            z: centroZ + Math.sin(angulo) * radio
        };
    }

    obtenerPuntoBusqueda(ultimaPosConocida) {
        if (!ultimaPosConocida) return null;

        // Buscar en espiral alrededor de la última posición conocida
        const radio = 5 + (this.tiempoBuscando * 2); // Radio crece con el tiempo
        const angulo = this.tiempoBuscando * 1.5; // Ángulo cambia con el tiempo

        return this.generarPuntoBusqueda(
            ultimaPosConocida.x,
            ultimaPosConocida.z,
            Math.min(radio, 25), // Máximo radio de 25
            angulo
        );
    }

    // ========================================
    // DETECCIÓN DE ESTAR QUIETO
    // ========================================

    verificarMovimiento(botPos, dt) {
        if (this.posicionAnterior) {
            const distMovida = Math.sqrt(
                Math.pow(botPos.x - this.posicionAnterior.x, 2) +
                Math.pow(botPos.z - this.posicionAnterior.z, 2)
            );

            if (distMovida < 0.1) {
                this.tiempoQuieto += dt;
            } else {
                this.tiempoQuieto = 0;
            }
        }
        this.posicionAnterior = { x: botPos.x, z: botPos.z };

        return this.tiempoQuieto > this.maxTiempoQuieto;
    }

    // ========================================
    // SISTEMA DE LÍNEA DE VISIÓN
    // ========================================

    tieneLineaDeVision(botPos, jugadorPos, laberintoRef, dimension, escala) {
        // --- Uso de Caché Global (Fase 1) ---
        if (typeof gameCache !== 'undefined' && gameCache) {
            const cachedValue = gameCache.getVision(botPos.x, botPos.z, jugadorPos.x, jugadorPos.z);
            if (cachedValue !== null) return cachedValue;
        }

        const dx = jugadorPos.x - botPos.x;
        const dz = jugadorPos.z - botPos.z;
        const distanciaSq = dx * dx + dz * dz;
        const distancia = Math.sqrt(distanciaSq);

        if (distancia > this.rangoVision) {
            const res = { visible: false, distancia: distancia };
            if (typeof gameCache !== 'undefined' && gameCache) gameCache.setVision(botPos.x, botPos.z, jugadorPos.x, jugadorPos.z, res);
            return res;
        }

        // Si están muy cerca, asumir visión directa (optimización)
        if (distancia < 2) {
            const res = { visible: true, distancia: distancia };
            if (typeof gameCache !== 'undefined' && gameCache) gameCache.setVision(botPos.x, botPos.z, jugadorPos.x, jugadorPos.z, res);
            return res;
        }

        const offset = (dimension * escala) / 2;
        const dirX = dx / distancia;
        const dirZ = dz / distancia;

        // Paso más inteligente: escala * 0.5 (mitad de un bloque)
        const pasoSize = escala * 0.5;
        const pasos = Math.ceil(distancia / pasoSize);

        for (let i = 1; i < pasos; i++) {
            const distCheck = i * pasoSize;
            const checkX = botPos.x + dirX * distCheck;
            const checkZ = botPos.z + dirZ * distCheck;

            const gx = Math.round((checkX + offset) / escala);
            const gz = Math.round((checkZ + offset) / escala);

            const tile = laberintoRef[gz]?.[gx];
            if (tile === 1) { // Pared
                const res = { visible: false, distancia: distancia };
                if (typeof gameCache !== 'undefined' && gameCache) gameCache.setVision(botPos.x, botPos.z, jugadorPos.x, jugadorPos.z, res);
                return res;
            }
        }

        const res = { visible: true, distancia: distancia };
        if (typeof gameCache !== 'undefined' && gameCache) gameCache.setVision(botPos.x, botPos.z, jugadorPos.x, jugadorPos.z, res);
        return res;
    }

    // ========================================
    // PREDICCIÓN DE MOVIMIENTO
    // ========================================

    actualizarHistorialJugador(posJugador) {
        this.historialPosJugador.push({
            x: posJugador.x,
            z: posJugador.z,
            tiempo: Date.now()
        });

        if (this.historialPosJugador.length > this.maxHistorial) {
            this.historialPosJugador.shift();
        }
    }

    predecirPosicionJugador(tiempoAdelante = 0.5) {
        if (this.historialPosJugador.length < 2) {
            return this.ultimaPosJugador;
        }

        const ultimo = this.historialPosJugador[this.historialPosJugador.length - 1];
        const anterior = this.historialPosJugador[this.historialPosJugador.length - 2];

        const dt = (ultimo.tiempo - anterior.tiempo) / 1000;
        if (dt <= 0) return { x: ultimo.x, z: ultimo.z };

        const velX = (ultimo.x - anterior.x) / dt;
        const velZ = (ultimo.z - anterior.z) / dt;

        return {
            x: ultimo.x + velX * tiempoAdelante,
            z: ultimo.z + velZ * tiempoAdelante
        };
    }

    // ========================================
    // SISTEMA DE EVASIÓN DE PROYECTILES
    // ========================================

    detectarProyectilPeligroso(botPos, proyectiles) {
        // Buscar proyectiles del jugador que vengan hacia el bot
        let proyectilMasCercano = null;
        let distanciaMinima = this.rangoDeteccionProyectil;

        for (const p of proyectiles) {
            // Solo esquivar proyectiles del jugador (owner === 1)
            if (p.owner !== 1) continue;

            const proyectilPos = {
                x: p.mesh.position.x,
                z: p.mesh.position.z
            };

            // Calcular distancia al proyectil
            const dist = Math.sqrt(
                Math.pow(proyectilPos.x - botPos.x, 2) +
                Math.pow(proyectilPos.z - botPos.z, 2)
            );

            if (dist > this.rangoDeteccionProyectil) continue;

            // Verificar si el proyectil viene hacia el bot
            const dirProyectil = { x: p.dir.x, z: p.dir.z };
            const haciaBot = {
                x: botPos.x - proyectilPos.x,
                z: botPos.z - proyectilPos.z
            };

            // Normalizar
            const magHacia = Math.sqrt(haciaBot.x * haciaBot.x + haciaBot.z * haciaBot.z);
            if (magHacia > 0) {
                haciaBot.x /= magHacia;
                haciaBot.z /= magHacia;
            }

            // Producto punto para ver si viene hacia nosotros
            const dotProduct = dirProyectil.x * haciaBot.x + dirProyectil.z * haciaBot.z;

            // Si el producto punto es positivo y alto, viene hacia nosotros
            if (dotProduct > 0.5 && dist < distanciaMinima) {
                distanciaMinima = dist;
                proyectilMasCercano = {
                    pos: proyectilPos,
                    dir: dirProyectil,
                    dist: dist
                };
            }
        }

        return proyectilMasCercano;
    }

    calcularDireccionEsquive(botPos, proyectil) {
        // Calcular direcciones perpendiculares al proyectil
        const perpendicular1 = { x: -proyectil.dir.z, z: proyectil.dir.x };
        const perpendicular2 = { x: proyectil.dir.z, z: -proyectil.dir.x };

        // Calcular cuál dirección nos aleja MÁS del proyectil
        // Vector del proyectil al bot
        const proyectilAlBot = {
            x: botPos.x - proyectil.pos.x,
            z: botPos.z - proyectil.pos.z
        };

        // Producto punto para ver cuál perpendicular está en la misma dirección
        // que el vector proyectil->bot (nos aleja del proyectil)
        const dot1 = perpendicular1.x * proyectilAlBot.x + perpendicular1.z * proyectilAlBot.z;
        const dot2 = perpendicular2.x * proyectilAlBot.x + perpendicular2.z * proyectilAlBot.z;

        // Elegir la dirección que nos aleja más
        if (dot1 > dot2) {
            return perpendicular1;
        } else {
            return perpendicular2;
        }
    }

    intentarEsquivar(botPos, proyectiles, dt) {
        // Actualizar cooldown
        this.cooldownEsquive -= dt;

        // Actualizar tiempo de esquive activo
        if (this.esquivando) {
            this.tiempoEsquive -= dt;
            if (this.tiempoEsquive <= 0) {
                this.esquivando = false;
            }
            return this.esquivando;
        }

        // Si estamos en cooldown, no podemos esquivar
        if (this.cooldownEsquive > 0) {
            return false;
        }

        // Detectar proyectil peligroso
        const amenaza = this.detectarProyectilPeligroso(botPos, proyectiles);

        if (amenaza) {
            // ¿Decidimos esquivar? (probabilidad)
            if (Math.random() < this.probabilidadEsquive) {
                this.esquivando = true;
                this.tiempoEsquive = this.duracionEsquive;
                this.cooldownEsquive = this.cooldownEsquiveMax;
                this.direccionEsquive = this.calcularDireccionEsquive(botPos, amenaza);

                // Más urgente si está más cerca
                if (amenaza.dist < 5) {
                    this.duracionEsquive = 0.5; // Esquive más largo si está cerca
                }

                return true;
            }
        }

        return false;
    }

    obtenerModificadorEsquive() {
        if (!this.esquivando) {
            return { x: 0, z: 0, activo: false };
        }

        // Devolver la dirección de esquive con intensidad basada en tiempo restante
        const intensidad = this.tiempoEsquive / this.duracionEsquive;
        return {
            x: this.direccionEsquive.x * intensidad * 2,
            z: this.direccionEsquive.z * intensidad * 2,
            activo: true
        };
    }

    // ========================================
    // DECISIÓN DE AGACHARSE MEJORADA
    // ========================================

    debeAgacharse(botPos, laberintoRef, dimension, escala, siguientePunto = null) {
        const offset = (dimension * escala) / 2;

        // Verificar puntos clave alrededor del bot
        const radioDeteccion = (typeof RADIO_BOT !== 'undefined') ? RADIO_BOT * 0.6 : 0.5;
        const puntos = [
            { x: botPos.x, z: botPos.z },
            { x: botPos.x + radioDeteccion, z: botPos.z },
            { x: botPos.x - radioDeteccion, z: botPos.z },
            { x: botPos.x, z: botPos.z + radioDeteccion },
            { x: botPos.x, z: botPos.z - radioDeteccion }
        ];

        for (let p of puntos) {
            const gx = Math.round((p.x + offset) / escala);
            const gz = Math.round((p.z + offset) / escala);
            const tile = laberintoRef[gz]?.[gx];
            if (tile === 2) {
                this.estaAgachado = true;
                return true;
            }
        }

        // Anticipación: Verificar si el siguiente punto es un hueco
        if (siguientePunto) {
            const gx = Math.round((siguientePunto.x + offset) / escala);
            const gz = Math.round((siguientePunto.z + offset) / escala);
            if (laberintoRef[gz]?.[gx] === 2) {
                this.estaAgachado = true;
                return true;
            }
        }

        this.estaAgachado = false;
        return false;
    }

    // ========================================
    // SISTEMA DE DISPARO
    // ========================================

    puedeDisparar(dt) {
        this.cooldownDisparo -= dt;
        return this.cooldownDisparo <= 0;
    }

    calcularPrecision(distancia) {
        if (distancia < this.rangoAtaque) {
            return this.precisionCercana;
        }
        const factor = 1 - (distancia - this.rangoAtaque) / (this.rangoDisparo - this.rangoAtaque);
        return this.precisionBase + (this.precisionCercana - this.precisionBase) * Math.max(0, factor);
    }

    intentarDisparar(distancia, tieneVision) {
        if (!tieneVision || distancia > this.rangoDisparo) {
            return false;
        }

        const precision = this.calcularPrecision(distancia);

        if (Math.random() < precision * 0.08) {
            this.cooldownDisparo = 0.8 + Math.random() * 0.5;
            return true;
        }

        return false;
    }

    // ========================================
    // MÁQUINA DE ESTADOS MEJORADA
    // ========================================

    actualizarEstado(botPos, jugadorPos, esCazador, tieneVision, distancia, dt, laberintoRef, dimension, escala) {
        const ahora = Date.now();

        // Generar waypoints si no existen
        this.generarWaypoints(laberintoRef, dimension, escala);

        // Verificar si está quieto
        const estaQuieto = this.verificarMovimiento(botPos, dt);

        // Actualizar memoria
        if (tieneVision) {
            this.ultimaPosJugador = { x: jugadorPos.x, z: jugadorPos.z };
            this.tiempoUltimaVista = ahora;
            this.actualizarHistorialJugador(jugadorPos);
            this.tiempoBuscando = 0;
        }

        const tiempoDesdeVista = ahora - this.tiempoUltimaVista;

        if (esCazador) {
            // ====== LÓGICA DE CAZADOR ======
            if (tieneVision) {
                if (distancia < this.rangoAtaque) {
                    this.estadoActual = this.ESTADOS.ATACAR;
                } else {
                    this.estadoActual = this.ESTADOS.PERSEGUIR;
                }
            } else if (this.ultimaPosJugador && tiempoDesdeVista < this.tiempoMemoria) {
                // Perdió de vista al jugador recientemente - BUSCAR
                this.estadoActual = this.ESTADOS.BUSCAR;
                this.tiempoBuscando += dt;

                if (this.tiempoBuscando > this.duracionBusqueda) {
                    // Búsqueda fallida, volver a patrullar
                    this.estadoActual = this.ESTADOS.PATRULLAR;
                    this.tiempoBuscando = 0;
                }
            } else {
                this.estadoActual = this.ESTADOS.PATRULLAR;
            }

            // Si está quieto mucho tiempo, forzar cambio de waypoint
            if (estaQuieto && this.estadoActual === this.ESTADOS.PATRULLAR) {
                this.obtenerSiguienteWaypoint();
                this.tiempoQuieto = 0;
            }
        } else {
            // ====== LÓGICA DE PRESA ======
            if (tieneVision && distancia < this.rangoVision * 0.6) {
                if (distancia < 10) {
                    // Muy cerca - HUIR urgentemente
                    this.estadoActual = this.ESTADOS.HUIR;
                    this.puntoEscondite = null;
                } else {
                    // Tiene tiempo - buscar escondite
                    if (!this.puntoEscondite) {
                        this.puntoEscondite = this.encontrarEscondite(
                            botPos, jugadorPos, laberintoRef, dimension, escala
                        );
                    }
                    this.estadoActual = this.ESTADOS.ESCONDERSE;
                }
                this.tiempoEscondido = 0;
            } else if (this.estadoActual === this.ESTADOS.ESCONDERSE && this.puntoEscondite) {
                // Verificar si llegó al escondite
                const distEscondite = Math.sqrt(
                    Math.pow(botPos.x - this.puntoEscondite.x, 2) +
                    Math.pow(botPos.z - this.puntoEscondite.z, 2)
                );

                if (distEscondite < 2) {
                    this.tiempoEscondido += dt;
                    if (this.tiempoEscondido > this.duracionEscondite) {
                        // Salir del escondite
                        this.puntoEscondite = null;
                        this.estadoActual = this.ESTADOS.PATRULLAR;
                    }
                }
            } else {
                this.estadoActual = this.ESTADOS.PATRULLAR;
                this.puntoEscondite = null;
            }

            if (estaQuieto) {
                this.obtenerSiguienteWaypoint();
                this.tiempoQuieto = 0;
            }
        }

        return this.estadoActual;
    }

    // ========================================
    // OBTENER OBJETIVO SEGÚN ESTADO
    // ========================================

    obtenerObjetivo(botPos, jugadorPos, esCazador, dt) {
        // Actualizar tiempo en waypoint
        this.tiempoEnWaypoint += dt;

        switch (this.estadoActual) {
            case this.ESTADOS.ATACAR:
            case this.ESTADOS.PERSEGUIR:
                // Usar predicción de movimiento
                if (this.historialPosJugador.length >= 2) {
                    return this.predecirPosicionJugador(0.4);
                }
                return this.ultimaPosJugador || { x: jugadorPos.x, z: jugadorPos.z };

            case this.ESTADOS.BUSCAR:
                // Buscar en espiral alrededor de última posición conocida
                return this.obtenerPuntoBusqueda(this.ultimaPosJugador);

            case this.ESTADOS.HUIR:
                // Alejarse rápidamente del jugador
                const huirDir = {
                    x: botPos.x - jugadorPos.x,
                    z: botPos.z - jugadorPos.z
                };
                const mag = Math.sqrt(huirDir.x * huirDir.x + huirDir.z * huirDir.z);
                if (mag > 0) {
                    return {
                        x: botPos.x + (huirDir.x / mag) * 25,
                        z: botPos.z + (huirDir.z / mag) * 25
                    };
                }
                return { x: botPos.x + 15, z: botPos.z + 15 };

            case this.ESTADOS.ESCONDERSE:
                // Ir al punto de escondite encontrado
                if (this.puntoEscondite) {
                    return this.puntoEscondite;
                }
                // Fallback a huir
                return {
                    x: botPos.x - jugadorPos.x + botPos.x,
                    z: botPos.z - jugadorPos.z + botPos.z
                };

            case this.ESTADOS.PATRULLAR:
            default:
                // Ir al siguiente waypoint
                if (this.waypoints.length > 0) {
                    const wp = this.waypoints[this.waypointActual];

                    // Verificar si llegó al waypoint
                    const distWp = Math.sqrt(
                        Math.pow(botPos.x - wp.x, 2) +
                        Math.pow(botPos.z - wp.z, 2)
                    );

                    if (distWp < 3 || this.tiempoEnWaypoint > 8) {
                        // Llegó o tardó mucho, siguiente waypoint
                        this.tiempoEnWaypoint = 0;
                        return this.obtenerSiguienteWaypoint();
                    }

                    return wp;
                }

                // Sin waypoints, movimiento aleatorio
                return {
                    x: botPos.x + (Math.random() - 0.5) * 20,
                    z: botPos.z + (Math.random() - 0.5) * 20
                };
        }
    }

    // ========================================
    // VELOCIDAD SEGÚN ESTADO
    // ========================================

    obtenerVelocidad(baseVel) {
        // Añadir pequeña variación para movimiento más natural
        const variacion = 1 + (Math.sin(Date.now() * 0.003) * 0.1);

        switch (this.estadoActual) {
            case this.ESTADOS.ATACAR:
                return baseVel * 1.4 * variacion;
            case this.ESTADOS.HUIR:
                return baseVel * 1.5 * variacion; // Más rápido huyendo
            case this.ESTADOS.PERSEGUIR:
                return baseVel * 1.2 * variacion;
            case this.ESTADOS.BUSCAR:
                return baseVel * 0.9 * variacion; // Más lento buscando
            case this.ESTADOS.ESCONDERSE:
                return baseVel * 1.1 * variacion;
            case this.ESTADOS.PATRULLAR:
            default:
                return baseVel * 0.8 * variacion; // Más lento patrullando
        }
    }

    // ========================================
    // SUAVIZADO DE DIRECCIÓN
    // ========================================

    suavizarDireccion(nuevaDirX, nuevaDirZ, dt) {
        const factor = Math.min(1, this.velocidadGiro * dt);

        this.direccionActual.x += (nuevaDirX - this.direccionActual.x) * factor;
        this.direccionActual.z += (nuevaDirZ - this.direccionActual.z) * factor;

        // Normalizar
        const mag = Math.sqrt(
            this.direccionActual.x * this.direccionActual.x +
            this.direccionActual.z * this.direccionActual.z
        );

        if (mag > 0) {
            this.direccionActual.x /= mag;
            this.direccionActual.z /= mag;
        }

        return this.direccionActual;
    }

    getEstadoTexto() {
        const iconos = {
            patrullar: '🚶',
            buscar: '🔍',
            perseguir: '🏃',
            huir: '💨',
            esconderse: '🙈',
            atacar: '⚔️'
        };
        return `${iconos[this.estadoActual] || '❓'} ${this.estadoActual.toUpperCase()}`;
    }
}

// Variable global
var botTactico = null;

function inicializarBotTactico() {
    botTactico = new BotTactico();
}
