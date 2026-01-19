// SOLO remover tracks de escala del root - arregla modelo gigante
function limpiarAnimacionesProblematicas(animaciones) {
    animaciones.forEach(clip => {
        clip.tracks = clip.tracks.filter(track => {
            // Remover SOLO escala del root (no tiene ":" de Mixamo)
            if (track.name.endsWith('.scale') && !track.name.includes(':')) {
                return false;
            }
            return true;
        });
    });
}

function limpiarAnimacionesEscala(animaciones) {
    limpiarAnimacionesProblematicas(animaciones);
}

function crearArma() {
    grupoArma = new THREE.Group();
    grupoArma.visible = false; // Oculta por defecto, se muestra al caminar

    // Cargar modelo FBX de pistola (tracked)
    cargarFBX('modelos/armas/pistola.fbx', function (object) {
        // Ajustar escala (más grande para primera persona)
        object.scale.set(0.004, 0.004, 0.004);

        // Posicionar en vista de primera persona
        object.position.set(0.4, -0.3, -0.8);

        // Rotar para apuntar hacia adelante
        object.rotation.set(0, Math.PI, 0);

        // Aplicar sombras y eliminar luces embebidas
        const lucesAEliminar = [];
        object.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
            if (child.isLight) {
                lucesAEliminar.push(child);
            }
        });

        // Eliminar luces embebidas del modelo
        lucesAEliminar.forEach(luz => {
            if (luz.parent) luz.parent.remove(luz);
        });

        grupoArma.add(object);
    });

    escena.add(grupoArma);
}

// Arma de respaldo si FBX falla
function crearArmaRespaldo() {
    const geoCuerpo = new THREE.BoxGeometry(0.2, 0.3, 0.8);
    const matArma = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1 });
    const cuerpo = new THREE.Mesh(geoCuerpo, matArma);
    cuerpo.position.set(0.4, -0.25, -1.0);
    grupoArma.add(cuerpo);
}

function spawnEntidades(customX = null, customZ = null) {
    const offset = (DIMENSION * ESCALA) / 2;
    const posInicialX = customX !== null ? customX : (1 * ESCALA - offset);
    const posInicialZ = customZ !== null ? customZ : (1 * ESCALA - offset);

    camara.position.set(posInicialX, 2, posInicialZ);

    // Guardar posición inicial del jugador
    posicionJugador.x = posInicialX;
    posicionJugador.y = 2;
    posicionJugador.z = posInicialZ;

    // ========================================
    // CREAR GRUPOS CONTENEDORES
    // ========================================
    if (!jugadorObj) {
        jugadorObj = new THREE.Group();
        // OPT-02: Luz azul para el jugador (solo en PC - luces dinámicas muy costosas en móvil)
        if (!esDispositivoTactil) {
            const luzJugador = new THREE.PointLight(0x00aaff, 1.5, 10);
            luzJugador.name = "luzEntidad";
            luzJugador.position.set(0, 0, 0);
            jugadorObj.add(luzJugador);
        }
    }
    // Asegurar que esté en la escena (especialmente importante en multijugador tras un reset)
    if (jugadorObj.parent !== escena) escena.add(jugadorObj);
    jugadorObj.position.set(posInicialX, 0, posInicialZ);
    jugadorObj.visible = terceraPersona;

    if (!botObj) {
        botObj = new THREE.Group();
        // OPT-02: Luz roja para el bot (solo en PC)
        if (!esDispositivoTactil) {
            const luzB = new THREE.PointLight(0xff0000, 2, 12);
            luzB.name = "luzEntidad";
            luzB.position.set(0, 2, 0);
            botObj.add(luzB);
        }
    }
    // Asegurar que esté en la escena
    if (botObj.parent !== escena) escena.add(botObj);

    // CB-23: Posición de spawn segura (evitar paredes)
    let botSpawnX = (DIMENSION - 2) * ESCALA - offset;
    let botSpawnZ = (DIMENSION - 2) * ESCALA - offset;

    // Buscar celda libre si la elegida es pared
    if (colision(botSpawnX, botSpawnZ, false, RADIO_BOT)) {
        for (let r = 1; r < 5; r++) {
            let found = false;
            for (let dz = -r; dz <= r; dz++) {
                for (let dx = -r; dx <= r; dx++) {
                    const tx = botSpawnX + dx * ESCALA;
                    const tz = botSpawnZ + dz * ESCALA;
                    if (!colision(tx, tz, false, RADIO_BOT)) {
                        botSpawnX = tx; botSpawnZ = tz;
                        found = true; break;
                    }
                }
                if (found) break;
            }
            if (found) break;
        }
    }
    botObj.position.set(botSpawnX, 0, botSpawnZ);

    // Si estamos en multijugador, el bot local no debe ser visible
    botObj.visible = !modoMultijugador;

    // Solo cargar si no es el mismo o no está cargado aún
    if (idPersonajeCargado !== idPersonajeSeleccionado && !estaCargandoPersonaje) {
        cargarModelosPersonaje(idPersonajeSeleccionado);
    }
}

function actualizarModelosPersonajes() {
    if (idPersonajeSeleccionado === idPersonajeCargado) return Promise.resolve();

    return cargarModelosPersonaje(idPersonajeSeleccionado);
}

async function cargarModelosPersonaje(idJugador) {
    if (estaCargandoPersonaje) {
        console.warn("Intento de carga de personaje bloqueado: ya hay una carga en curso.");
        return;
    }

    estaCargandoPersonaje = true;
    idPersonajeCargado = idJugador;

    // LIMPIEZA EFICIENTE de modelos anteriores (solo meshes y grupos de modelos)
    const limpiarGrupo = (grupo) => {
        if (!grupo) return;
        for (let i = grupo.children.length - 1; i >= 0; i--) {
            const child = grupo.children[i];
            if (child.name !== "luzEntidad") { // Preservar luces con nombre
                if (child.geometry) child.geometry.dispose();
                grupo.remove(child);
            }
        }
    };

    limpiarGrupo(jugadorObj);
    limpiarGrupo(botObj);

    // CB-60: Resetear caches de animación al cargar nuevos modelos
    _botTodasAnimCache = null;
    _jugadorTodasAnimCache = null;

    jugadorContenedor = null;
    jugadorModelo = null;
    jugadorMixer = null;
    jugadorAnimaciones = { caminar: [], parado: [], agachado: [], disparar: [], dispararCaminando: [], strafe: [], strafeCombinado: [], strafeCombinadoIzq: [], strafeCombinadoDer: [], saltar: [], saltarLateral: [] };

    botContenedor = null;
    botModelo = null;
    botMixer = null;
    botAnimaciones = { caminar: [], parado: [], agachado: [], disparar: [], dispararCaminando: [], strafe: [], strafeCombinado: [], strafeCombinadoIzq: [], strafeCombinadoDer: [], saltar: [], saltarLateral: [] };

    const personData = personajesSium[idJugador];
    const models = personData.modelos;

    // Seleccionar personaje aleatorio para el bot (diferente al del jugador)
    const personajesDisponibles = Object.keys(personajesSium).filter(id => id !== idJugador);
    const idBotLocal = personajesDisponibles[Math.floor(Math.random() * personajesDisponibles.length)];
    idPersonajeBot = idBotLocal; // Guardar en variable global para la cinemática
    const personDataBot = personajesSium[idBotLocal];
    console.log(`[Sium] Bot usando personaje: ${personDataBot.nombre}`);
    const modelsBot = personDataBot.modelos;

    // Nota: El total de assets (8) ya fue configurado en matchLoadingTracker.start() en main.js 
    // antes de llamar a esta función.

    // Función auxiliar para configurar el modelo cargado
    const configurarModelo = (object, isPlayer) => {
        object.scale.set(ESCALA_PERSONAJE, ESCALA_PERSONAJE, ESCALA_PERSONAJE);
        const contenedorRotacion = new THREE.Group();
        contenedorRotacion.rotation.set(paradoRotacionX, paradoRotacionY, paradoRotacionZ);
        contenedorRotacion.add(object);

        const data = isPlayer ? personData : personDataBot;
        let manualTexture = null;
        if (data.textura) {
            manualTexture = cargarTextura(data.textura);
            manualTexture.encoding = THREE.sRGBEncoding;
            manualTexture.flipY = true;
        }

        const lucesAEliminar = [];
        object.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (manualTexture) {
                    const applyTex = (m) => { m.map = manualTexture; m.color.set(0xffffff); m.needsUpdate = true; };
                    if (Array.isArray(child.material)) child.material.forEach(applyTex); else applyTex(child.material);
                }
            }
            if (child.isLight) lucesAEliminar.push(child);
            const n = child.name.toLowerCase();
            // CB-18: Optimización - Detectar también .obj embebidos de Mixamo
            if (n.includes('tmpqebahx5v') || n.includes('gun') || n.includes('weapon') || n.includes('.obj')) {
                if (isPlayer) jugadorArmaObj = child;
                else botArmaObj = child;
                child.visible = false;
            }
        });
        lucesAEliminar.forEach(luz => { if (luz.parent) luz.parent.remove(luz); });

        const mixer = new THREE.AnimationMixer(object);
        limpiarAnimacionesEscala(object.animations);

        if (isPlayer) {
            jugadorModelo = object;
            jugadorContenedor = contenedorRotacion;
            jugadorMixer = mixer;
            jugadorObj.add(contenedorRotacion);
            object.animations.forEach(anim => {
                const action = mixer.clipAction(anim);
                action.setLoop(THREE.LoopRepeat);
                jugadorAnimaciones.caminar.push(action);
            });
        } else {
            botModelo = object;
            botContenedor = contenedorRotacion;
            botMixer = mixer;
            botObj.add(contenedorRotacion);
            object.animations.forEach(anim => {
                const action = mixer.clipAction(anim);
                action.setLoop(THREE.LoopRepeat);
                botAnimaciones.caminar.push(action);
            });
        }
    };

    try {
        console.log(`[Sium] Iniciando carga de modelos base para: ${idJugador}`);

        // 1. CARGAR MODELOS BASE EN PARALELO
        const [objJugador, objBot] = await Promise.all([
            cargarFBXPromise(models.caminar).then(obj => { matchLoadingTracker.track(); return obj; }),
            cargarFBXPromise(modelsBot.caminar).then(obj => { matchLoadingTracker.track(); return obj; })
        ]);

        // 2. CONFIGURAR MODELOS Y MIXERS
        configurarModelo(objJugador, true);
        configurarModelo(objBot, false);

        console.log(`[Sium] Modelos base listos. Cargando set de animaciones extra...`);

        // 3. CARGAR ANIMACIONES EXTRA EN PARALELO (Ahora que los mixers existen)
        const promisesExtra = [
            // Jugador
            cargarFBXPromise(models.parado).then(obj => {
                matchLoadingTracker.track();
                limpiarAnimacionesEscala(obj.animations);
                obj.animations.forEach(anim => {
                    if (jugadorMixer) {
                        const action = jugadorMixer.clipAction(anim);
                        action.setLoop(THREE.LoopRepeat);
                        jugadorAnimaciones.parado.push(action);
                    }
                });
            }),
            // ... resto de animaciones extra ...
            cargarFBXPromise(models.agachado).then(obj => {
                matchLoadingTracker.track();
                limpiarAnimacionesEscala(obj.animations);
                obj.animations.forEach(anim => {
                    if (jugadorMixer) {
                        const action = jugadorMixer.clipAction(anim);
                        action.setLoop(THREE.LoopRepeat);
                        jugadorAnimaciones.agachado.push(action);
                    }
                });
            }),
            cargarFBXPromise(models.disparo).then(obj => {
                matchLoadingTracker.track();
                limpiarAnimacionesEscala(obj.animations);
                obj.animations.forEach(anim => {
                    if (jugadorMixer) {
                        const action = jugadorMixer.clipAction(anim);
                        action.setLoop(THREE.LoopOnce);
                        action.clampWhenFinished = true;
                        action.timeScale = 2.0;
                        jugadorAnimaciones.disparar.push(action);
                    }
                });
            }),
            // Bot
            cargarFBXPromise(modelsBot.parado).then(obj => {
                matchLoadingTracker.track();
                limpiarAnimacionesEscala(obj.animations);
                obj.animations.forEach(anim => {
                    if (botMixer) {
                        const action = botMixer.clipAction(anim);
                        action.setLoop(THREE.LoopRepeat);
                        botAnimaciones.parado.push(action);
                    }
                });
            }),
            cargarFBXPromise(modelsBot.agachado).then(obj => {
                matchLoadingTracker.track();
                limpiarAnimacionesEscala(obj.animations);
                obj.animations.forEach(anim => {
                    if (botMixer) {
                        const action = botMixer.clipAction(anim);
                        action.setLoop(THREE.LoopRepeat);
                        botAnimaciones.agachado.push(action);
                    }
                });
            }),
            cargarFBXPromise(modelsBot.disparo).then(obj => {
                matchLoadingTracker.track();
                limpiarAnimacionesEscala(obj.animations);
                obj.animations.forEach(anim => {
                    if (botMixer) {
                        const action = botMixer.clipAction(anim);
                        action.setLoop(THREE.LoopOnce);
                        action.clampWhenFinished = true;
                        action.timeScale = 2.0;
                        botAnimaciones.disparar.push(action);
                    }
                });
            })
        ];

        // 3b. CARGAR ANIMACIONES OPCIONALES (strafe, saltar) - Solo si el personaje las tiene
        const promisesOpcionales = [];

        // Strafe del Jugador
        if (models.strafe) {
            promisesOpcionales.push(
                cargarFBXPromise(models.strafe).then(obj => {
                    limpiarAnimacionesEscala(obj.animations);
                    obj.animations.forEach(anim => {
                        if (jugadorMixer) {
                            const action = jugadorMixer.clipAction(anim);
                            action.setLoop(THREE.LoopRepeat);
                            jugadorAnimaciones.strafe.push(action);
                        }
                    });
                    console.log(`[Sium] Animación strafe cargada para jugador`);
                }).catch(err => console.warn('[Sium] No se pudo cargar animación strafe:', err))
            );
        }

        // Saltar del Jugador
        if (models.saltar) {
            promisesOpcionales.push(
                cargarFBXPromise(models.saltar).then(obj => {
                    limpiarAnimacionesEscala(obj.animations);
                    obj.animations.forEach(anim => {
                        if (jugadorMixer) {
                            const action = jugadorMixer.clipAction(anim);
                            action.setLoop(THREE.LoopOnce);
                            action.clampWhenFinished = true;
                            jugadorAnimaciones.saltar.push(action);
                        }
                    });
                    console.log(`[Sium] Animación saltar cargada para jugador`);
                }).catch(err => console.warn('[Sium] No se pudo cargar animación saltar:', err))
            );
        }

        // Strafe del Bot (si el personaje del bot lo tiene)
        if (modelsBot.strafe) {
            promisesOpcionales.push(
                cargarFBXPromise(modelsBot.strafe).then(obj => {
                    limpiarAnimacionesEscala(obj.animations);
                    obj.animations.forEach(anim => {
                        if (botMixer) {
                            const action = botMixer.clipAction(anim);
                            action.setLoop(THREE.LoopRepeat);
                            botAnimaciones.strafe.push(action);
                        }
                    });
                    console.log(`[Sium] Animación strafe cargada para bot`);
                }).catch(err => console.warn('[Sium] No se pudo cargar animación strafe para bot:', err))
            );
        }

        // Saltar del Bot (si el personaje del bot lo tiene)
        if (modelsBot.saltar) {
            promisesOpcionales.push(
                cargarFBXPromise(modelsBot.saltar).then(obj => {
                    limpiarAnimacionesEscala(obj.animations);
                    obj.animations.forEach(anim => {
                        if (botMixer) {
                            const action = botMixer.clipAction(anim);
                            action.setLoop(THREE.LoopOnce);
                            action.clampWhenFinished = true;
                            botAnimaciones.saltar.push(action);
                        }
                    });
                    console.log(`[Sium] Animación saltar cargada para bot`);
                }).catch(err => console.warn('[Sium] No se pudo cargar animación saltar para bot:', err))
            );
        }

        // Esperar animaciones opcionales (sin bloquear si fallan)
        if (promisesOpcionales.length > 0) {
            await Promise.all(promisesOpcionales);
        }

        // Disparo Caminando del Jugador
        if (models.disparoCaminando) {
            promisesOpcionales.push(
                cargarFBXPromise(models.disparoCaminando).then(obj => {
                    limpiarAnimacionesEscala(obj.animations);
                    obj.animations.forEach(anim => {
                        if (jugadorMixer) {
                            const action = jugadorMixer.clipAction(anim);
                            action.setLoop(THREE.LoopOnce);
                            action.clampWhenFinished = true;
                            action.timeScale = 2.0;
                            jugadorAnimaciones.dispararCaminando.push(action);
                        }
                    });
                    console.log(`[Sium] Animación disparo caminando cargada para jugador`);
                }).catch(err => console.warn('[Sium] No se pudo cargar animación disparo caminando:', err))
            );
        }

        // --- Strafe Combinado Lateralizado (NUEVO) ---
        // Izquierda (W+A)
        if (models.strafeCombinadoIzq) {
            promisesOpcionales.push(
                cargarFBXPromise(models.strafeCombinadoIzq).then(obj => {
                    limpiarAnimacionesEscala(obj.animations);
                    obj.animations.forEach(anim => {
                        if (jugadorMixer) {
                            const action = jugadorMixer.clipAction(anim);
                            action.setLoop(THREE.LoopRepeat);
                            jugadorAnimaciones.strafeCombinadoIzq.push(action);
                        }
                    });
                    console.log(`[Sium] Animación strafe combinado IZQ cargada para jugador`);
                }).catch(err => console.warn('[Sium] No se pudo cargar animación strafe combinado IZQ:', err))
            );
        }
        // Derecha (W+S / W+D)
        if (models.strafeCombinadoDer) {
            promisesOpcionales.push(
                cargarFBXPromise(models.strafeCombinadoDer).then(obj => {
                    limpiarAnimacionesEscala(obj.animations);
                    obj.animations.forEach(anim => {
                        if (jugadorMixer) {
                            const action = jugadorMixer.clipAction(anim);
                            action.setLoop(THREE.LoopRepeat);
                            jugadorAnimaciones.strafeCombinadoDer.push(action);
                        }
                    });
                    console.log(`[Sium] Animación strafe combinado DER cargada para jugador`);
                }).catch(err => console.warn('[Sium] No se pudo cargar animación strafe combinado DER:', err))
            );
        }

        // --- Versión Bot ---
        if (modelsBot.strafeCombinadoIzq) {
            promisesOpcionales.push(
                cargarFBXPromise(modelsBot.strafeCombinadoIzq).then(obj => {
                    limpiarAnimacionesEscala(obj.animations);
                    obj.animations.forEach(anim => {
                        if (botMixer) {
                            const action = botMixer.clipAction(anim);
                            action.setLoop(THREE.LoopRepeat);
                            botAnimaciones.strafeCombinadoIzq.push(action);
                        }
                    });
                }).catch(err => console.warn('[Sium] No se pudo cargar animación strafe combinado IZQ para bot:', err))
            );
        }
        if (modelsBot.strafeCombinadoDer) {
            promisesOpcionales.push(
                cargarFBXPromise(modelsBot.strafeCombinadoDer).then(obj => {
                    limpiarAnimacionesEscala(obj.animations);
                    obj.animations.forEach(anim => {
                        if (botMixer) {
                            const action = botMixer.clipAction(anim);
                            action.setLoop(THREE.LoopRepeat);
                            botAnimaciones.strafeCombinadoDer.push(action);
                        }
                    });
                }).catch(err => console.warn('[Sium] No se pudo cargar animación strafe combinado DER para bot:', err))
            );
        }

        // Salto Lateral del Jugador
        if (models.saltarLateral) {
            promisesOpcionales.push(
                cargarFBXPromise(models.saltarLateral).then(obj => {
                    limpiarAnimacionesEscala(obj.animations);
                    obj.animations.forEach(anim => {
                        if (jugadorMixer) {
                            const action = jugadorMixer.clipAction(anim);
                            action.setLoop(THREE.LoopOnce);
                            action.clampWhenFinished = true;
                            jugadorAnimaciones.saltarLateral.push(action);
                        }
                    });
                    console.log(`[Sium] Animación salto lateral cargada para jugador`);
                }).catch(err => console.warn('[Sium] No se pudo cargar animación salto lateral:', err))
            );
        }

        // Salto Lateral del Bot
        if (modelsBot.saltarLateral) {
            promisesOpcionales.push(
                cargarFBXPromise(modelsBot.saltarLateral).then(obj => {
                    limpiarAnimacionesEscala(obj.animations);
                    obj.animations.forEach(anim => {
                        if (botMixer) {
                            const action = botMixer.clipAction(anim);
                            action.setLoop(THREE.LoopOnce);
                            action.clampWhenFinished = true;
                            botAnimaciones.saltarLateral.push(action);
                        }
                    });
                    console.log(`[Sium] Animación salto lateral cargada para bot`);
                }).catch(err => console.warn('[Sium] No se pudo cargar animación salto lateral para bot:', err))
            );
        }

        await Promise.all(promisesExtra);

        // 4. FINALIZAR CONFIGURACIÓN
        jugadorAnimsBase = [...jugadorAnimaciones.caminar, ...jugadorAnimaciones.parado, ...jugadorAnimaciones.agachado, ...jugadorAnimaciones.strafe];
        botAnimsBase = [...botAnimaciones.caminar, ...botAnimaciones.parado, ...botAnimaciones.agachado, ...botAnimaciones.strafe];

        if (typeof cambiarAnimacionJugador === 'function') cambiarAnimacionJugador(false, false);
        if (typeof cambiarAnimacionBot === 'function') cambiarAnimacionBot(false, false);

        console.log(`[Sium] Carga de modelos y animaciones completada`);
    } catch (err) {
        console.error("[Sium] Error critico cargando modelos:", err);
        idPersonajeCargado = null;
    } finally {
        estaCargandoPersonaje = false;
    }
}


// Bot de respaldo si FBX falla (cubo rojo)
function crearBotRespaldo() {
    const geoB = new THREE.BoxGeometry(1.5, 3.5, 1.5);
    const matB = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x220000 });
    const cubo = new THREE.Mesh(geoB, matB);
    cubo.position.set(0, 1.75, 0);
    botObj.add(cubo);
}

function disparar(quien) {
    if (!activo || cazadorId !== quien || !projectilePool) return;

    // Control de cadencia para el jugador
    if (quien === 1) {
        if (!jugadorPuedeDisparar) return;
        jugadorPuedeDisparar = false;



        // Cooldown basado en la animación
        setTimeout(() => { jugadorPuedeDisparar = true; }, 500);

        // Activar flag de disparo para forzar rotación hacia adelante
        jugadorDisparando = true;
        setTimeout(() => { jugadorDisparando = false; }, 600);
    } else if (quien === 2) {
        // Activar flag de disparo para el bot
        botDisparando = true;
        setTimeout(() => { botDisparando = false; }, 600);
    }

    // Retroceso visual (Primera persona)
    if (quien === 1) {
        grupoArma.position.z += 0.25;
        setTimeout(() => { if (grupoArma) grupoArma.position.z -= 0.25; }, 80);

        // Animación de disparo en tercera persona
        if (terceraPersona && jugadorObj) {
            // Forzar rotación inmediata hacia yaw (donde mira la cámara)
            jugadorObj.rotation.y = yaw - Math.PI;

            // Seleccionar animación: preferir dispararCaminando si se mueve
            let animsADisparar = (jugadorMoviendo && jugadorAnimaciones.dispararCaminando && jugadorAnimaciones.dispararCaminando.length > 0)
                ? jugadorAnimaciones.dispararCaminando
                : jugadorAnimaciones.disparar;

            if (animsADisparar && animsADisparar.length > 0) {
                // REDUCIR peso de otras animaciones
                // CB-FIX: Si estamos agachados, mantener el peso de las animaciones de agachado
                jugadorAnimsBase.forEach(a => {
                    const isAgachadoAnim = (jugadorAnimaciones.agachado && jugadorAnimaciones.agachado.includes(a));
                    if (jugadorAgachado && isAgachadoAnim) {
                        a.setEffectiveWeight(1.0);
                    } else {
                        a.setEffectiveWeight(0.1);
                    }
                });

                animsADisparar.forEach(a => {
                    a.stop();
                    a.reset();
                    a.setEffectiveWeight(1.0);
                    a.setEffectiveTimeScale(1.8);
                    a.play();
                });

                // RESTAURAR peso después de un tiempo y limpiar animación
                setTimeout(() => {
                    jugadorAnimsBase.forEach(a => a.setEffectiveWeight(1.0));
                    if (animsADisparar) {
                        animsADisparar.forEach(a => a.fadeOut(0.2));
                    }
                }, 450);
            } else if (terceraPersona) {
                console.warn("No hay animaciones de disparo cargadas para JUGADOR");
            }
        }
    } else if (botObj && quien === 2) {
        // Animación de disparo para el bot
        let animsADispararBot = (botMoviendo && botAnimaciones.dispararCaminando && botAnimaciones.dispararCaminando.length > 0)
            ? botAnimaciones.dispararCaminando
            : botAnimaciones.disparar;

        if (animsADispararBot && animsADispararBot.length > 0) {
            // CB-FIX: Símil para el bot
            botAnimsBase.forEach(a => {
                const isAgachadoAnim = (botAnimaciones.agachado && botAnimaciones.agachado.includes(a));
                if (botAgachado && isAgachadoAnim) {
                    a.setEffectiveWeight(1.0);
                } else {
                    a.setEffectiveWeight(0.1);
                }
            });

            animsADispararBot.forEach(a => {
                a.stop();
                a.reset();
                a.setEffectiveWeight(1.0);
                a.setEffectiveTimeScale(1.8);
                a.play();
            });

            setTimeout(() => {
                botAnimsBase.forEach(a => a.setEffectiveWeight(1.0));
                if (animsADispararBot) {
                    animsADispararBot.forEach(a => a.fadeOut(0.2));
                }
            }, 450);
        }
    }

    // Calcular posición y dirección para el proyectil
    _vecTarget.set(0, 0, 0);

    if (quien === 1) {
        camara.getWorldDirection(_vecTarget);
        _vecNextPos.copy(camara.position).addScaledVector(_vecTarget, 1);
    } else {
        _vecTarget.subVectors(_vecJugador, botObj.position).normalize();
        _vecNextPos.copy(botObj.position).addScaledVector(_vecTarget, 1.5);
    }

    // Obtener proyectil del pool
    projectilePool.acquire(quien, _vecNextPos, _vecTarget);

    // ========================================
    // ENVIAR DISPARO POR RED (solo jugador, no bot)
    // ========================================
    if (quien === 1 && modoMultijugador && typeof enviarDisparo === 'function') {
        enviarDisparo(
            _vecNextPos.x, _vecNextPos.y, _vecNextPos.z,
            _vecTarget.x, _vecTarget.y, _vecTarget.z
        );
    }

    // Flash de disparo (Pooled)
    if (flashPool) {
        flashPool.show(_vecNextPos, (quien === 1 ? 0xffff00 : 0xff0000));
    }
}

// ========================================
// FUNCIONES PARA CAMBIAR ANIMACIONES
// ========================================
// CB-52: Cache de todas las animaciones para evitar crear arrays cada frame
var _botTodasAnimCache = null;
var _jugadorTodasAnimCache = null;
// CB-53: Cache de flags de arma por animación (evita string operations cada frame)
var _botArmaFlags = new WeakMap();
var _jugadorArmaFlags = new WeakMap();

// Precalcular si una animación es de arma (llamar después de cargar animaciones)
function _precalcularArmaFlags(animaciones, flagMap) {
    for (const key in animaciones) {
        if (animaciones[key] && Array.isArray(animaciones[key])) {
            animaciones[key].forEach(a => {
                if (a && a.getClip) {
                    const nombreLower = a.getClip().name.toLowerCase();
                    const esArma = nombreLower.includes('.obj') || nombreLower.includes('gun') || nombreLower.includes('weapon');
                    flagMap.set(a, esArma);
                }
            });
        }
    }
}

// Cambia la animación del bot entre caminar, parado y agachado
function cambiarAnimacionBot(moviendo, agachado) {
    // CB-54: Early return si no hay mixer (ahorra todas las operaciones)
    if (!botMixer) return;

    if (botMoviendo === moviendo && botAgachado === agachado) return; // Sin cambios reales

    // Determinar qué conjunto estaba activo y cuál debería estar ahora
    const setAnterior = botAgachado ? 2 : (botMoviendo ? 1 : 0); // 0=parado, 1=caminar, 2=agachado
    const setNuevo = agachado ? 2 : (moviendo ? 1 : 0);

    // Si seguimos en el mismo set (ej: seguimos agachados), solo actualizamos parámetros
    if (setAnterior === setNuevo && setNuevo === 2) {
        botMoviendo = moviendo;
        botAgachado = agachado;
        if (botAnimaciones.agachado) {
            const ts = moviendo ? 1.0 : 0.0;
            for (let i = 0; i < botAnimaciones.agachado.length; i++) {
                botAnimaciones.agachado[i].timeScale = ts;
            }
        }
        return;
    }

    botMoviendo = moviendo;
    botAgachado = agachado;

    const duracionTransicion = 0.3;
    // CB-FIX: No ocultar el arma si está disparando
    const ocultarArma = (!moviendo || agachado) && !botDisparando;

    // Mostrar/ocultar arma del modelo
    if (botArmaObj) {
        botArmaObj.visible = !ocultarArma;
    }

    // CB-55: Usar cache en lugar de crear array cada frame
    if (!_botTodasAnimCache) {
        _botTodasAnimCache = [];
        for (const key in botAnimaciones) {
            if (botAnimaciones[key] && Array.isArray(botAnimaciones[key])) {
                _botTodasAnimCache.push(...botAnimaciones[key]);
            }
        }
        _precalcularArmaFlags(botAnimaciones, _botArmaFlags);
    }

    // Detener todas las animaciones actuales
    for (let i = 0; i < _botTodasAnimCache.length; i++) {
        const a = _botTodasAnimCache[i];
        const esArma = _botArmaFlags.get(a);
        if (esArma && ocultarArma) {
            a.stop();
        } else {
            a.fadeOut(duracionTransicion);
        }
    }

    // Seleccionar animaciones activas
    const animsActivas = agachado ? botAnimaciones.agachado : (moviendo ? botAnimaciones.caminar : botAnimaciones.parado);
    if (!animsActivas) return;

    for (let i = 0; i < animsActivas.length; i++) {
        const a = animsActivas[i];
        const esArma = _botArmaFlags.get(a);
        if (esArma && ocultarArma) {
            a.stop();
        } else {
            a.timeScale = (agachado && !moviendo) ? 0.0 : 1.0;
            a.reset().fadeIn(duracionTransicion).play();
        }
    }
}

// Cambia la animación del jugador entre caminar, parado y agachado
function cambiarAnimacionJugador(moviendo, agachado) {
    // CB-54: Early return si no hay mixer
    if (!jugadorMixer) return;

    if (jugadorMoviendo === moviendo && jugadorAgachado === agachado) return;

    const setAnterior = jugadorAgachado ? 2 : (jugadorMoviendo ? 1 : 0);
    const setNuevo = agachado ? 2 : (moviendo ? 1 : 0);

    if (setAnterior === setNuevo && setNuevo === 2) {
        jugadorMoviendo = moviendo;
        jugadorAgachado = agachado;
        if (jugadorAnimaciones.agachado) {
            const ts = moviendo ? 1.0 : 0.0;
            for (let i = 0; i < jugadorAnimaciones.agachado.length; i++) {
                jugadorAnimaciones.agachado[i].timeScale = ts;
            }
        }
        return;
    }

    jugadorMoviendo = moviendo;
    jugadorAgachado = agachado;

    const duracionTransicion = 0.3;
    // CB-FIX: No ocultar el arma si está disparando
    const ocultarArma = (!moviendo || agachado) && !jugadorDisparando;

    if (jugadorArmaObj) {
        jugadorArmaObj.visible = !ocultarArma;
    }

    // CB-55: Usar cache en lugar de crear array cada frame
    if (!_jugadorTodasAnimCache) {
        _jugadorTodasAnimCache = [];
        for (const key in jugadorAnimaciones) {
            if (jugadorAnimaciones[key] && Array.isArray(jugadorAnimaciones[key])) {
                _jugadorTodasAnimCache.push(...jugadorAnimaciones[key]);
            }
        }
        _precalcularArmaFlags(jugadorAnimaciones, _jugadorArmaFlags);
    }

    for (let i = 0; i < _jugadorTodasAnimCache.length; i++) {
        const a = _jugadorTodasAnimCache[i];
        const esArma = _jugadorArmaFlags.get(a);
        if (esArma && ocultarArma) {
            a.stop();
        } else {
            a.fadeOut(duracionTransicion);
        }
    }

    const animsActivas = agachado ? jugadorAnimaciones.agachado : (moviendo ? jugadorAnimaciones.caminar : jugadorAnimaciones.parado);
    if (!animsActivas) return;

    for (let i = 0; i < animsActivas.length; i++) {
        const a = animsActivas[i];
        const esArma = _jugadorArmaFlags.get(a);
        if (esArma && ocultarArma) {
            a.stop();
        } else {
            a.timeScale = (agachado && !moviendo) ? 0.0 : 1.0;
            a.reset().fadeIn(duracionTransicion).play();
        }
    }
}

// ========================================
// NUEVAS ANIMACIONES: STRAFE Y SALTAR
// ========================================
var jugadorStrafing = false;  // Estado de movimiento lateral del jugador
var jugadorSaltando = false;  // Estado de salto del jugador
var botStrafing = false;      // Estado de movimiento lateral del bot
var botSaltando = false;      // Estado de salto del bot

// Activa la animación de strafe (caminar lateral) para el jugador
var _lastStrafeDir = 0; // Guardar última dirección para detectar cambios
var _lastStrafeAnimId = ''; // Guardar ID de la animación actual
var _lastStrafeCombinado = false; // Guardar si era combinado

function activarStrafeJugador(direccion, esCombinado = false) {
    // direccion: -1 = izquierda (D), 1 = derecha (A), 0 = desactivar
    // (Nota: En los controles actuales KeyA es moviendoLateral=1 y KeyD es moviendoLateral=-1)
    if (!jugadorMixer) return;

    let animsTarget = null;
    let usaCombinado = false;

    if (direccion !== 0) {
        if (esCombinado) {
            // Intentar usar las nuevas animaciones lateralizadas si existen
            if (direccion === 1 && jugadorAnimaciones.strafeCombinadoDer && jugadorAnimaciones.strafeCombinadoDer.length > 0) {
                animsTarget = jugadorAnimaciones.strafeCombinadoDer;
                usaCombinado = true;
            } else if (direccion === -1 && jugadorAnimaciones.strafeCombinadoIzq && jugadorAnimaciones.strafeCombinadoIzq.length > 0) {
                animsTarget = jugadorAnimaciones.strafeCombinadoIzq;
                usaCombinado = true;
            } else if (jugadorAnimaciones.strafeCombinado && jugadorAnimaciones.strafeCombinado.length > 0) {
                // Fallback a la combinada única
                animsTarget = jugadorAnimaciones.strafeCombinado;
                usaCombinado = true;
            }
        }

        // Si no se eligió combinada o no existe, usar strafe normal
        if (!animsTarget) {
            animsTarget = jugadorAnimaciones.strafe;
            usaCombinado = false;
        }
    }

    if (!animsTarget || animsTarget.length === 0) {
        if (direccion === 0 && jugadorStrafing) {
            jugadorStrafing = false;
            _lastStrafeDir = 0;
            _lastStrafeCombinado = false;
            // Detener todo por si acaso
            [jugadorAnimaciones.strafe, jugadorAnimaciones.strafeCombinado, jugadorAnimaciones.strafeCombinadoIzq, jugadorAnimaciones.strafeCombinadoDer].forEach(set => {
                if (set) set.forEach(a => a.fadeOut(0.15));
            });
        }
        return;
    }

    if (direccion === 0) {
        if (jugadorStrafing) {
            jugadorStrafing = false;
            _lastStrafeDir = 0;
            _lastStrafeCombinado = false;
            [jugadorAnimaciones.strafe, jugadorAnimaciones.strafeCombinado, jugadorAnimaciones.strafeCombinadoIzq, jugadorAnimaciones.strafeCombinadoDer].forEach(set => {
                if (set) set.forEach(a => a.fadeOut(0.15));
            });
        }
        return;
    }

    // Identificador único para el estado actual de strafe (incluyendo qué animación específica se usa)
    const animId = animsTarget[0]?.getClip().name || '';
    if (jugadorStrafing && _lastStrafeDir === direccion && _lastStrafeAnimId === animId) return;

    const duracion = jugadorStrafing ? 0.1 : 0.15;
    _lastStrafeDir = direccion;
    _lastStrafeAnimId = animId;
    jugadorStrafing = true;

    jugadorMoviendo = null;
    jugadorAgachado = null;

    // Detener otros sets
    const setsADetener = [
        jugadorAnimaciones.caminar,
        jugadorAnimaciones.parado,
        jugadorAnimaciones.agachado,
        jugadorAnimaciones.strafe,
        jugadorAnimaciones.strafeCombinado,
        jugadorAnimaciones.strafeCombinadoIzq,
        jugadorAnimaciones.strafeCombinadoDer
    ];
    setsADetener.forEach(set => {
        if (set && set !== animsTarget) set.forEach(a => a.fadeOut(duracion));
    });

    // Activar seleccionado
    animsTarget.forEach(a => {
        // Solo aplicar mirror si es el strafe normal (las combinadas ya vienen direccionales)
        if (animsTarget === jugadorAnimaciones.strafe) {
            a.timeScale = direccion;
        } else {
            a.timeScale = 1.0;
        }
        a.setEffectiveWeight(1.0);
        a.reset().fadeIn(duracion).play();
    });
}

// Activa la animación de salto para el jugador
function activarSaltoJugador() {
    if (jugadorSaltando || !estaEnElSuelo) return; // Ya está saltando o en el aire

    // --- Mecánica Física (Siempre se ejecuta) ---
    jugadorSaltando = true;
    estaEnElSuelo = false;
    velocidadVertical = FUERZA_SALTO;

    // Retroceso visual del arma en primera persona al saltar
    if (!terceraPersona && grupoArma) {
        grupoArma.position.y -= 0.1;
        grupoArma.rotation.x += 0.05;
        setTimeout(() => {
            if (grupoArma) {
                grupoArma.position.y += 0.1;
                grupoArma.rotation.x -= 0.05;
            }
        }, 200);
    }

    // --- Animación Visual (Si está disponible) ---
    // Seleccionar animación: usar saltarLateral si el personaje está en strafe
    let animsASaltar = (jugadorStrafing && jugadorAnimaciones.saltarLateral && jugadorAnimaciones.saltarLateral.length > 0)
        ? jugadorAnimaciones.saltarLateral
        : jugadorAnimaciones.saltar;

    if (!jugadorMixer || !animsASaltar || animsASaltar.length === 0) return;

    const duracion = 0.15;

    // Reducir peso de otras animaciones
    if (jugadorAnimsBase) {
        jugadorAnimsBase.forEach(a => a.setEffectiveWeight(0.2));
    }

    // Activar animación de salto
    animsASaltar.forEach(a => {
        a.stop();
        a.reset();
        a.setEffectiveWeight(1.0);
        a.play();
    });

    // Detectar cuando termina la animación visual (pero la física sigue su curso)
    const duracionAnim = animsASaltar[0]?.getClip()?.duration || 1.0;
    setTimeout(() => {
        jugadorSaltando = false;
        if (jugadorAnimsBase) {
            jugadorAnimsBase.forEach(a => a.setEffectiveWeight(1.0));
        }
        if (animsASaltar) {
            animsASaltar.forEach(a => a.fadeOut(0.3));
        }
    }, duracionAnim * 1000 - 200);
}

// Activa la animación de strafe para el bot
var _lastStrafeDirBot = 0;
var _lastStrafeCombinadoBot = false;

function activarStrafeBot(direccion, esCombinado = false) {
    if (!botMixer) return;

    const tieneCombinado = botAnimaciones.strafeCombinado && botAnimaciones.strafeCombinado.length > 0;
    const usaCombinado = tieneCombinado && esCombinado;
    const animsTarget = usaCombinado ? botAnimaciones.strafeCombinado : botAnimaciones.strafe;

    if (!animsTarget || animsTarget.length === 0) {
        if (direccion === 0 && botStrafing) {
            botStrafing = false;
            _lastStrafeDirBot = 0;
            _lastStrafeCombinadoBot = false;
        }
        return;
    }

    if (direccion === 0) {
        if (botStrafing) {
            botStrafing = false;
            _lastStrafeDirBot = 0;
            _lastStrafeCombinadoBot = false;
            if (botAnimaciones.strafe) botAnimaciones.strafe.forEach(a => a.fadeOut(0.2));
            if (botAnimaciones.strafeCombinado) botAnimaciones.strafeCombinado.forEach(a => a.fadeOut(0.2));
        }
        return;
    }

    if (botStrafing && _lastStrafeDirBot === direccion && _lastStrafeCombinadoBot === usaCombinado) return;

    const duracion = botStrafing ? 0.1 : 0.25;
    _lastStrafeDirBot = direccion;
    _lastStrafeCombinadoBot = usaCombinado;
    botStrafing = true;

    const otrosSets = [botAnimaciones.caminar, botAnimaciones.parado, botAnimaciones.agachado, usaCombinado ? botAnimaciones.strafe : botAnimaciones.strafeCombinado];
    otrosSets.forEach(set => {
        if (set) set.forEach(a => a.fadeOut(duracion));
    });

    animsTarget.forEach(a => {
        a.timeScale = direccion;
        a.reset().fadeIn(duracion).play();
    });
}

// Activa la animación de salto para el bot
function activarSaltoBot() {
    if (!botMixer || !botAnimaciones.saltar || botAnimaciones.saltar.length === 0) return;
    if (botSaltando) return;

    botSaltando = true;
    const duracion = 0.15;

    botAnimsBase.forEach(a => a.setEffectiveWeight(0.2));

    botAnimaciones.saltar.forEach(a => {
        a.stop();
        a.reset();
        a.setEffectiveWeight(1.0);
        a.play();
    });

    const duracionAnim = botAnimaciones.saltar[0]?.getClip()?.duration || 1.0;
    setTimeout(() => {
        botSaltando = false;
        botAnimsBase.forEach(a => a.setEffectiveWeight(1.0));
        botAnimaciones.saltar.forEach(a => a.fadeOut(0.3));
    }, duracionAnim * 1000 - 200);
}
