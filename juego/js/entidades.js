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
        // Luz azul para el jugador
        const luzJugador = new THREE.PointLight(0x00aaff, 1.5, 10);
        luzJugador.position.set(0, 0, 0);
        jugadorObj.add(luzJugador);
    }
    // Asegurar que esté en la escena (especialmente importante en multijugador tras un reset)
    if (jugadorObj.parent !== escena) escena.add(jugadorObj);
    jugadorObj.position.set(posInicialX, 0, posInicialZ);
    jugadorObj.visible = terceraPersona;

    if (!botObj) {
        botObj = new THREE.Group();
        // Luz roja para el bot
        const luzB = new THREE.PointLight(0xff0000, 2, 12);
        luzB.position.set(0, 2, 0);
        botObj.add(luzB);
    }
    // Asegurar que esté en la escena
    if (botObj.parent !== escena) escena.add(botObj);
    botObj.position.set((DIMENSION - 2) * ESCALA - offset, 0, (DIMENSION - 2) * ESCALA - offset);

    // Si estamos en multijugador, el bot local no debe ser visible
    botObj.visible = !modoMultijugador;

    // Cargar modelos iniciales
    cargarModelosPersonaje(idPersonajeSeleccionado);
}

function actualizarModelosPersonajes() {
    if (idPersonajeSeleccionado === idPersonajeCargado) return;
    console.log("Actualizando modelos de personajes...");
    cargarModelosPersonaje(idPersonajeSeleccionado);
}

function cargarModelosPersonaje(idJugador) {
    idPersonajeCargado = idJugador;

    // Limpiar modelos anteriores del jugador
    if (jugadorContenedor && jugadorContenedor.parent) {
        jugadorContenedor.parent.remove(jugadorContenedor);
    }
    jugadorModelo = null;
    jugadorMixer = null;

    const models = personajesSium[idJugador].modelos;

    // Cargar Jugador
    cargarFBX(models.caminar, function (object) {
        jugadorModelo = object;
        object.scale.set(ESCALA_PERSONAJE, ESCALA_PERSONAJE, ESCALA_PERSONAJE);

        const contenedorRotacion = new THREE.Group();
        jugadorContenedor = contenedorRotacion;
        contenedorRotacion.rotation.set(paradoRotacionX, paradoRotacionY, paradoRotacionZ);
        contenedorRotacion.add(object);

        const lucesAEliminar = [];
        const personData = personajesSium[idJugador];
        let manualTexture = null;

        if (personData.textura) {
            manualTexture = cargarTextura(personData.textura);
            manualTexture.encoding = THREE.sRGBEncoding;
            manualTexture.flipY = true;
            console.log(`Aplicando textura manual a ${idJugador}: ${personData.textura}`);
        }

        object.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                if (manualTexture) {
                    const applyTex = (m) => {
                        m.map = manualTexture;
                        m.color.set(0xffffff); // Asegurar que sea blanco para que no tinte la textura
                        m.needsUpdate = true;
                    };
                    if (Array.isArray(child.material)) child.material.forEach(applyTex); else applyTex(child.material);
                }

                if (child.material) {
                    const cfg = (m) => { if (m.map) m.map.encoding = THREE.sRGBEncoding; m.needsUpdate = true; };
                    if (Array.isArray(child.material)) child.material.forEach(cfg); else cfg(child.material);
                }
            }
            if (child.isLight) {
                lucesAEliminar.push(child);
            }
            const n = child.name.toLowerCase();
            if (n.includes('tmpqebahx5v') || n.includes('gun') || n.includes('weapon')) {
                jugadorArmaObj = child;
                child.visible = false;
            }
        });
        lucesAEliminar.forEach(luz => { if (luz.parent) luz.parent.remove(luz); });

        jugadorMixer = new THREE.AnimationMixer(object);
        jugadorAnimaciones = { caminar: [], parado: [], agachado: [], disparar: [] };
        limpiarAnimacionesEscala(object.animations);
        object.animations.forEach(anim => {
            const action = jugadorMixer.clipAction(anim);
            action.setLoop(THREE.LoopRepeat);
            jugadorAnimaciones.caminar.push(action);
        });

        jugadorObj.add(contenedorRotacion);

        // Cargar otras animaciones jugador
        cargarFBX(models.parado, function (fbx) {
            limpiarAnimacionesEscala(fbx.animations);
            fbx.animations.forEach(anim => {
                const action = jugadorMixer.clipAction(anim);
                action.setLoop(THREE.LoopRepeat);
                jugadorAnimaciones.parado.push(action);
            });
            cargarFBX(models.agachado, function (fbx) {
                limpiarAnimacionesEscala(fbx.animations);
                fbx.animations.forEach(anim => {
                    const action = jugadorMixer.clipAction(anim);
                    action.setLoop(THREE.LoopRepeat);
                    jugadorAnimaciones.agachado.push(action);
                });
                cargarFBX(models.disparo, function (fbx) {
                    limpiarAnimacionesEscala(fbx.animations);
                    fbx.animations.forEach(anim => {
                        const action = jugadorMixer.clipAction(anim);
                        action.setLoop(THREE.LoopOnce);
                        action.clampWhenFinished = true;
                        action.timeScale = 2.0;
                        jugadorAnimaciones.disparar.push(action);
                    });
                    cambiarAnimacionJugador(false, false);
                });
            });
        });
    });

    // Cargar Bot
    // Limpiar modelos anteriores del bot
    if (botContenedor && botContenedor.parent) {
        botContenedor.parent.remove(botContenedor);
    }
    botModelo = null;
    botMixer = null;

    const idBot = idJugador === 'agente' ? 'cill' : 'agente';
    const personDataBot = personajesSium[idBot];
    const modelsBot = personDataBot.modelos;

    cargarFBX(modelsBot.caminar, function (object) {
        botModelo = object;
        object.scale.set(ESCALA_PERSONAJE, ESCALA_PERSONAJE, ESCALA_PERSONAJE);

        const contenedorRotacion = new THREE.Group();
        botContenedor = contenedorRotacion;
        contenedorRotacion.rotation.set(paradoRotacionX, paradoRotacionY, paradoRotacionZ);
        contenedorRotacion.add(object);

        const lucesAEliminarBot = [];
        let manualTextureBot = null;
        if (personDataBot.textura) {
            manualTextureBot = cargarTextura(personDataBot.textura);
            manualTextureBot.encoding = THREE.sRGBEncoding;
            manualTextureBot.flipY = true;
        }

        object.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                if (manualTextureBot) {
                    const applyTex = (m) => {
                        m.map = manualTextureBot;
                        m.color.set(0xffffff);
                        m.needsUpdate = true;
                    };
                    if (Array.isArray(child.material)) child.material.forEach(applyTex); else applyTex(child.material);
                }

                if (child.material) {
                    const cfg = (m) => { if (m.map) m.map.encoding = THREE.sRGBEncoding; m.needsUpdate = true; };
                    if (Array.isArray(child.material)) child.material.forEach(cfg); else cfg(child.material);
                }
                const n = child.name.toLowerCase();
                if (n.includes('.obj') || n.includes('gun') || n.includes('weapon')) botArmaObj = child;
            }
            if (child.isLight) {
                lucesAEliminarBot.push(child);
            }
        });
        lucesAEliminarBot.forEach(luz => { if (luz.parent) luz.parent.remove(luz); });

        botMixer = new THREE.AnimationMixer(object);
        botAnimaciones = { caminar: [], parado: [], agachado: [], disparar: [] };
        limpiarAnimacionesEscala(object.animations);
        object.animations.forEach(anim => {
            const action = botMixer.clipAction(anim);
            action.setLoop(THREE.LoopRepeat);
            botAnimaciones.caminar.push(action);
        });

        botObj.add(contenedorRotacion);

        // Cargar otras animaciones bot
        cargarFBX(modelsBot.parado, function (fbx) {
            limpiarAnimacionesEscala(fbx.animations);
            fbx.animations.forEach(anim => {
                const action = botMixer.clipAction(anim);
                action.setLoop(THREE.LoopRepeat);
                botAnimaciones.parado.push(action);
            });
            cargarFBX(modelsBot.agachado, function (fbx) {
                limpiarAnimacionesEscala(fbx.animations);
                fbx.animations.forEach(anim => {
                    const action = botMixer.clipAction(anim);
                    action.setLoop(THREE.LoopRepeat);
                    botAnimaciones.agachado.push(action);
                });
                cargarFBX(modelsBot.disparo, function (fbx) {
                    limpiarAnimacionesEscala(fbx.animations);
                    fbx.animations.forEach(anim => {
                        const action = botMixer.clipAction(anim);
                        action.setLoop(THREE.LoopOnce);
                        action.clampWhenFinished = true;
                        action.timeScale = 2.0;
                        botAnimaciones.disparar.push(action);
                    });
                    cambiarAnimacionBot(false, false);
                });
            });
        });
    });
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

        console.log("JUGADOR DISPARA - Iniciando secuencia de animación");

        // Cooldown basado en la animación
        setTimeout(() => { jugadorPuedeDisparar = true; }, 500);

        // Activar flag de disparo para forzar rotación hacia adelante
        jugadorDisparando = true;
        setTimeout(() => { jugadorDisparando = false; }, 600);
    }

    // Retroceso visual (Primera persona)
    if (quien === 1) {
        grupoArma.position.z += 0.25;
        setTimeout(() => { if (grupoArma) grupoArma.position.z -= 0.25; }, 80);

        // Animación de disparo en tercera persona
        if (terceraPersona && jugadorObj) {
            // Forzar rotación inmediata hacia yaw (donde mira la cámara)
            // Restar Math.PI porque en tercera persona el yaw está invertido
            jugadorObj.rotation.y = yaw - Math.PI;

            if (jugadorAnimaciones.disparar && jugadorAnimaciones.disparar.length > 0) {
                console.log("  Animando disparo JUGADOR...");

                // REDUCIR peso de otras animaciones para que no "anulen" el disparo
                const animsBase = [...jugadorAnimaciones.caminar, ...jugadorAnimaciones.parado, ...jugadorAnimaciones.agachado];
                animsBase.forEach(a => a.setEffectiveWeight(0.1));

                jugadorAnimaciones.disparar.forEach(a => {
                    a.stop();
                    a.reset();
                    a.setEffectiveWeight(1.0);
                    a.setEffectiveTimeScale(1.8);
                    a.play();
                    console.log("    Clip disparar play: " + a.getClip().name);
                });

                // RESTAURAR peso después de un tiempo y limpiar animación
                setTimeout(() => {
                    animsBase.forEach(a => a.setEffectiveWeight(1.0));

                    // Hacer un fadeOut de la animación de disparo para que no se quede "atrapada"
                    if (jugadorAnimaciones.disparar) {
                        jugadorAnimaciones.disparar.forEach(a => a.fadeOut(0.2));
                    }

                    console.log("    Pesos de animación restaurados y disparo limpiado");
                }, 450);
            } else if (terceraPersona) {
                console.warn("  No hay animaciones de disparo cargadas para JUGADOR");
            }
        } else {
            // Animación de disparo para el bot
            if (botAnimaciones.disparar && botAnimaciones.disparar.length > 0) {
                const animsBaseBot = [...botAnimaciones.caminar, ...botAnimaciones.parado, ...botAnimaciones.agachado];
                animsBaseBot.forEach(a => a.setEffectiveWeight(0.1));

                botAnimaciones.disparar.forEach(a => {
                    a.stop();
                    a.reset();
                    a.setEffectiveWeight(1.0);
                    a.setEffectiveTimeScale(1.8);
                    a.play();
                });

                setTimeout(() => {
                    animsBaseBot.forEach(a => a.setEffectiveWeight(1.0));
                    if (botAnimaciones.disparar) {
                        botAnimaciones.disparar.forEach(a => a.fadeOut(0.2));
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

        // Flash de disparo
        const flash = new THREE.PointLight(0xffff00, 3, 10);
        flash.position.copy(_vecNextPos);
        escena.add(flash);
        setTimeout(() => escena.remove(flash), 50);
    }
}

// ========================================
// FUNCIONES PARA CAMBIAR ANIMACIONES
// ========================================

// Cambia la animación del bot entre caminar, parado y agachado
function cambiarAnimacionBot(moviendo, agachado) {
    // Determinar qué conjunto estaba activo y cuál debería estar ahora
    const setAnterior = botAgachado ? 'agachado' : (botMoviendo ? 'caminar' : 'parado');
    const setNuevo = agachado ? 'agachado' : (moviendo ? 'caminar' : 'parado');

    if (botMoviendo === moviendo && botAgachado === agachado) return; // Sin cambios reales

    // Si seguimos en el mismo set (ej: seguimos agachados), solo actualizamos parámetros
    if (setAnterior === setNuevo && setNuevo === 'agachado') {
        botMoviendo = moviendo;
        botAgachado = agachado;
        if (botAnimaciones.agachado) {
            botAnimaciones.agachado.forEach(a => a.timeScale = moviendo ? 1.0 : 0.0);
        }
        return;
    }

    botMoviendo = moviendo;
    botAgachado = agachado;

    const duracionTransicion = 0.3; // segundos

    // Mostrar/ocultar arma del modelo (ocultar si está agachado o parado)
    if (botArmaObj) {
        botArmaObj.visible = moviendo && !agachado;
    }

    // Detener todas las animaciones actuales (incluyendo disparo si quedó algo)
    const todasAnim = [...botAnimaciones.caminar, ...botAnimaciones.parado, ...botAnimaciones.agachado, ...botAnimaciones.disparar];
    todasAnim.forEach(a => a.fadeOut(duracionTransicion));

    let animsActivas = [];
    if (agachado) {
        animsActivas = botAnimaciones.agachado;
    } else if (moviendo) {
        animsActivas = botAnimaciones.caminar;
    } else {
        animsActivas = botAnimaciones.parado;
    }

    animsActivas.forEach(a => {
        // Si estamos parado, no animar el arma
        if (!moviendo && !agachado) {
            const nombre = a.getClip().name.toLowerCase();
            if (nombre.includes('object') || nombre.includes('transform')) {
                a.stop();
                return;
            }
        }

        // Si estamos agachados, solo animar si nos movemos
        if (agachado) {
            a.timeScale = moviendo ? 1.0 : 0.0;
        } else {
            a.timeScale = 1.0;
        }

        a.reset().fadeIn(duracionTransicion).play();
    });
}

// Cambia la animación del jugador entre caminar, parado y agachado
function cambiarAnimacionJugador(moviendo, agachado) {
    // Determinar qué conjunto estaba activo y cuál debería estar ahora
    const setAnterior = jugadorAgachado ? 'agachado' : (jugadorMoviendo ? 'caminar' : 'parado');
    const setNuevo = agachado ? 'agachado' : (moviendo ? 'caminar' : 'parado');

    if (jugadorMoviendo === moviendo && jugadorAgachado === agachado) return; // Sin cambios reales

    // Si seguimos en el mismo set (ej: seguimos agachados), solo actualizamos parámetros
    if (setAnterior === setNuevo && setNuevo === 'agachado') {
        jugadorMoviendo = moviendo;
        jugadorAgachado = agachado;
        if (jugadorAnimaciones.agachado) {
            jugadorAnimaciones.agachado.forEach(a => a.timeScale = moviendo ? 1.0 : 0.0);
        }
        return;
    }

    jugadorMoviendo = moviendo;
    jugadorAgachado = agachado;

    const duracionTransicion = 0.3; // segundos

    // Mostrar/ocultar arma del modelo
    if (jugadorArmaObj) {
        jugadorArmaObj.visible = moviendo && !agachado;
    }

    // Detener todas las animaciones actuales (incluyendo disparo si quedó algo)
    const todasAnim = [...jugadorAnimaciones.caminar, ...jugadorAnimaciones.parado, ...jugadorAnimaciones.agachado, ...jugadorAnimaciones.disparar];
    todasAnim.forEach(a => {
        const nombreLower = a.getClip().name.toLowerCase();
        const esArma = nombreLower.includes('.obj') || nombreLower.includes('gun') || nombreLower.includes('weapon');

        if (esArma && (!moviendo || agachado)) {
            a.stop();
        } else {
            a.fadeOut(duracionTransicion);
        }
    });

    let animsActivas = [];
    if (agachado) {
        animsActivas = jugadorAnimaciones.agachado;
    } else if (moviendo) {
        animsActivas = jugadorAnimaciones.caminar;
    } else {
        animsActivas = jugadorAnimaciones.parado;
    }

    animsActivas.forEach(a => {
        const nombreLower = a.getClip().name.toLowerCase();
        const esArma = nombreLower.includes('.obj') || nombreLower.includes('gun') || nombreLower.includes('weapon');

        if (esArma && (!moviendo || agachado)) {
            a.stop();
        } else {
            // Si estamos agachados, solo animar si nos movemos
            if (agachado) {
                a.timeScale = moviendo ? 1.0 : 0.0;
            } else {
                a.timeScale = 1.0;
            }
            a.reset().fadeIn(duracionTransicion).play();
        }
    });
}
