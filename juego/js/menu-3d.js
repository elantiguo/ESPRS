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

        // Cámara con más distancia para asegurar encuadre
        const vCamara = new THREE.PerspectiveCamera(45, contenedor.clientWidth / contenedor.clientHeight, 0.1, 100);
        vCamara.position.set(0, 1.2, 5);
        vCamara.lookAt(0, 0.8, 0);

        // Renderizador
        const vRender = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        vRender.setSize(contenedor.clientWidth, contenedor.clientHeight);
        vRender.setClearColor(0x000000, 0); // Transparente
        vRender.setPixelRatio(window.devicePixelRatio);
        contenedor.appendChild(vRender.domElement);

        // Iluminación futurista
        const lightColors = {
            'agente': 0x00aaff,
            'rufy': 0xff00ff,
            'ivan': 0x00ff88,
            'cill': 0xffff00
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
            // Ajustar escala y posición para que encajen en el visor pequeño
            const s = 0.0008;
            object.scale.set(s, s, s);
            object.position.y = -0.9;
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

function animarVisores() {
    requestAnimationFrame(animarVisores);
    const delta = 0.016; // Aprox 60fps

    Object.keys(visoresMenu).forEach(id => {
        const v = visoresMenu[id];
        if (v.mixer) v.mixer.update(delta);
        if (v.modelo) {
            v.modelo.rotation.y += 0.01; // Rotación lenta futurista
        }
        v.render.render(v.escena, v.camara);
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
