// ========================================
// SISTEMA DE PREVISUALIZACIÓN 3D EN MENÚ
// ========================================

var visoresMenu = {}; // { id: { escena, camara, renderizador, mixer } }

function initVisoresPersonajes() {
    const ids = Object.keys(personajesSium);
    ids.forEach(id => {
        const contenedor = document.getElementById('visor-' + id);
        if (!contenedor) return;

        // Escena básica
        const vEscena = new THREE.Scene();

        // Cámara optimizada para mejor encuadre del personaje
        const vCamara = new THREE.PerspectiveCamera(40, contenedor.clientWidth / contenedor.clientHeight, 0.1, 100);
        vCamara.position.set(0, 0.9, 4.0);
        vCamara.lookAt(0, 0.5, 0);

        // OPT-12: Renderizador para visores de personajes
        // Mejor calidad que el juego porque son modelos pequeños y estáticos
        const vRender = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true, // Antialiasing activado para personajes nítidos
            powerPreference: 'low-power' // Ahorrar batería en el menú
        });
        vRender.setSize(contenedor.clientWidth, contenedor.clientHeight);
        vRender.setClearColor(0x000000, 0); // Transparente
        // Pixel ratio moderado en móviles (1.5) para buen balance calidad/rendimiento
        vRender.setPixelRatio(Math.min(window.devicePixelRatio, esDispositivoTactil ? 1.5 : 2));
        contenedor.appendChild(vRender.domElement);

        // Iluminación futurista
        const lightColors = {
            'agente': 0x00aaff,
            'rufy': 0xff00ff,
            'ivan': 0x00ff88,
            'cill': 0xffff00,
            'nero': 0xff4400,
            'drina': 0xffaa00,
            'carpincho': 0xc0ff00
        };
        const colorLuz = lightColors[id] || 0xffffff;
        const luzPuntual = new THREE.PointLight(colorLuz, 2, 10);
        luzPuntual.position.set(2, 2, 2);
        vEscena.add(luzPuntual);
        vEscena.add(new THREE.AmbientLight(0xffffff, 0.5));

        visoresMenu[id] = {
            escena: vEscena,
            camara: vCamara,
            render: vRender,
            mixer: null,
            modelo: null
        };

        // Cargar modelo
        const loader = new THREE.FBXLoader();
        const fbxPath = personajesSium[id].modelos.parado;

        loader.load(fbxPath, (object) => {
            // Escalas individuales por personaje (ajustadas según el tamaño de cada modelo)
            const escalasPorPersonaje = {
                'agente': 0.0005,
                'cill': 0.0005,
                'rufy': 0.0005,
                'ivan': 0.0005,
                'nero': 0.0005,     // Nero es más grande, reducir escala
                'drina': 0.0005,    // Drina es más grande, reducir escala
                'carpincho': 0.0005 // Carpincho es mucho más grande, reducir más
            };

            // Posiciones Y individuales para centrar cada modelo
            const posicionYPorPersonaje = {
                'agente': -0.85,
                'cill': -0.85,
                'rufy': -0.85,
                'ivan': -0.85,
                'nero': -0.75,
                'drina': -0.65,
                'carpincho': -0.55
            };

            const s = escalasPorPersonaje[id] || 0.0008;
            const posY = posicionYPorPersonaje[id] || -0.85;
            object.scale.set(s, s, s);
            object.position.y = posY;
            object.position.z = 0;

            // Limpiar tracks de escala problemáticos (igual que en entidades.js)
            if (typeof limpiarAnimacionesProblematicas === 'function') {
                limpiarAnimacionesProblematicas(object.animations);
            }

            vEscena.add(object);
            visoresMenu[id].modelo = object;

            const pData = personajesSium[id];
            let visorTexture = null;
            if (pData.textura) {
                visorTexture = cargarTextura(pData.textura);
                visorTexture.encoding = THREE.sRGBEncoding;
                visorTexture.flipY = true;
            }

            if (object.animations && object.animations.length > 0) {
                const mixer = new THREE.AnimationMixer(object);
                visoresMenu[id].mixer = mixer;
                const action = mixer.clipAction(object.animations[0]);
                action.play();
            }

            // Aplicar materiales basicos
            object.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;

                    if (visorTexture) {
                        const apply = (m) => {
                            m.map = visorTexture;
                            m.color.set(0xffffff);
                            m.needsUpdate = true;
                        };
                        if (Array.isArray(child.material)) child.material.forEach(apply); else apply(child.material);
                    }

                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => { m.skinning = true; });
                        } else {
                            child.material.skinning = true;
                        }
                    }
                }
            });
        });
    });
}

// OPT-13: Variables para throttle de animación en móviles
var _menuLastFrameTime = 0;
var _menuFrameInterval = esDispositivoTactil ? 50 : 16; // 20 FPS en móvil, ~60 FPS en PC

function animarVisores(tiempo) {
    requestAnimationFrame(animarVisores);

    // OPT-13: Throttle de animación en móviles para ahorrar batería
    if (esDispositivoTactil) {
        const elapsed = tiempo - _menuLastFrameTime;
        if (elapsed < _menuFrameInterval) return;
    }
    _menuLastFrameTime = tiempo;

    const delta = 0.016; // Aprox 60fps base

    Object.keys(visoresMenu).forEach(id => {
        const v = visoresMenu[id];
        if (v.mixer) v.mixer.update(delta);
        if (v.modelo) {
            v.modelo.rotation.y += 0.01; // Rotación lenta futurista
        }
        v.render.render(v.escena, v.camara);
    });
}

function actualizarVisoresMenu() {
    Object.keys(visoresMenu).forEach(id => {
        const v = visoresMenu[id];
        const contenedor = document.getElementById('visor-' + id);
        if (!contenedor || !v) return;

        const w = contenedor.clientWidth;
        const h = contenedor.clientHeight;

        if (w > 0 && h > 0) {
            v.camara.aspect = w / h;
            v.camara.updateProjectionMatrix();
            v.render.setSize(w, h);
        }
    });
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Esperar un poco a que Three.js y config estén disponibles
    setTimeout(() => {
        initVisoresPersonajes();
        animarVisores();
    }, 500);
});
