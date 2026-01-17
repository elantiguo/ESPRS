// ========================================
// SISTEMA DE UI - SIUM DUEL
// ========================================

function actualizarUI() {
    const rol = document.getElementById('rol-jugador');
    const baseClasses = "text-2xl font-black italic tracking-tighter uppercase mr-4 transition-all duration-300 ";

    if (cazadorId === 1) {
        rol.innerText = "🎯 ERES EL CAZADOR";
        rol.className = baseClasses + "text-yellow-400 animate-pulse scale-110";
    } else {
        rol.innerText = "🏃 ¡ESCAPA DEL BOT!";
        rol.className = baseClasses + "text-red-500";
    }
}

function mostrarPausa() {
    document.getElementById('menu-pausa').classList.remove('hidden');
}

function ocultarPausa() {
    document.getElementById('menu-pausa').classList.add('hidden');
}

function finalizar(res) {
    juegoTerminado = true;
    activo = false;
    document.exitPointerLock();

    const overlay = document.getElementById('overlay');
    const titulo = document.getElementById('menu-titulo');
    const btnTexto = document.querySelector('button[onclick="iniciarJuego()"] span');

    // Cambiar visual del menú para estado "Game Over"
    titulo.innerText = res;
    titulo.classList.add('text-red-500');
    if (btnTexto) btnTexto.innerText = "REINTENTAR DUELO";

    overlay.classList.remove('hidden');

    // Ocultar HUD del juego
    const hud = document.getElementById('hud-juego');
    if (hud) hud.classList.add('hidden');

    // Limpiar pool de proyectiles
    if (projectilePool) projectilePool.clear();

    // Detener animaciones para liberar recursos
    if (botMixer) botMixer.stopAllAction();
    if (jugadorMixer) jugadorMixer.stopAllAction();
}

function onResize() {
    camara.aspect = window.innerWidth / window.innerHeight;
    camara.updateProjectionMatrix();
    renderizador.setSize(window.innerWidth, window.innerHeight);
}

// --- Gestión de Personajes ---
function seleccionarPersonaje(id) {
    idPersonajeSeleccionado = id;
    localStorage.setItem('sium_personaje_id', id);

    // UI Feedback
    const p = personajesSium[id];
    const descEl = document.getElementById('personaje-desc');
    if (descEl) descEl.innerText = p.desc;

    // Remove selected class from all buttons
    Object.keys(personajesSium).forEach(bid => {
        const b = document.getElementById('btn-p-' + bid);
        if (b) {
            b.classList.remove('selected');
        }
    });

    // Add selected class to active button
    const btn = document.getElementById('btn-p-' + id);
    if (btn) {
        btn.classList.add('selected');
    }

    // Sincronizar con multijugador si está conectado
    if (typeof enviarPersonaje === 'function') {
        enviarPersonaje(id);
    }

    console.log("Personaje seleccionado:", p.nombre);
}

// --- Sistema de Partículas del Menu ---
function crearParticulasMenu() {
    const container = document.getElementById('particles-container');
    if (!container) return;

    const particleCount = 30;
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#6366f1'];

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'menu-particle';

        // Random position
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';

        // Random size
        const size = Math.random() * 3 + 1;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';

        // Random color
        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

        // Random animation
        particle.style.animationDuration = (Math.random() * 10 + 5) + 's';
        particle.style.animationDelay = (Math.random() * 5) + 's';
        particle.style.opacity = Math.random() * 0.5 + 0.2;

        container.appendChild(particle);
    }

    // Add particle styles dynamically
    if (!document.getElementById('particle-styles')) {
        const style = document.createElement('style');
        style.id = 'particle-styles';
        style.textContent = `
            .menu-particle {
                position: absolute;
                border-radius: 50%;
                pointer-events: none;
                animation: floatParticle ease-in-out infinite;
                box-shadow: 0 0 10px currentColor;
            }
            
            @keyframes floatParticle {
                0%, 100% {
                    transform: translateY(0) translateX(0) scale(1);
                    opacity: 0.3;
                }
                25% {
                    transform: translateY(-30px) translateX(10px) scale(1.2);
                    opacity: 0.6;
                }
                50% {
                    transform: translateY(-20px) translateX(-10px) scale(0.8);
                    opacity: 0.4;
                }
                75% {
                    transform: translateY(-40px) translateX(5px) scale(1.1);
                    opacity: 0.5;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// --- Smooth Scroll Navigation Arrows ---
function setupScrollNavigation() {
    const grid = document.querySelector('.selector-personajes-grid');
    if (!grid) return;

    // Create navigation arrows
    const container = grid.parentElement;

    const leftArrow = document.createElement('button');
    leftArrow.className = 'scroll-nav-arrow scroll-nav-left';
    leftArrow.innerHTML = '‹';
    leftArrow.onclick = () => {
        grid.scrollBy({ left: -200, behavior: 'smooth' });
    };

    const rightArrow = document.createElement('button');
    rightArrow.className = 'scroll-nav-arrow scroll-nav-right';
    rightArrow.innerHTML = '›';
    rightArrow.onclick = () => {
        grid.scrollBy({ left: 200, behavior: 'smooth' });
    };

    container.appendChild(leftArrow);
    container.appendChild(rightArrow);

    // Update arrow visibility based on scroll position
    function updateArrows() {
        const showLeft = grid.scrollLeft > 10;
        const showRight = grid.scrollLeft < grid.scrollWidth - grid.clientWidth - 10;

        leftArrow.style.opacity = showLeft ? '1' : '0';
        leftArrow.style.pointerEvents = showLeft ? 'auto' : 'none';
        rightArrow.style.opacity = showRight ? '1' : '0';
        rightArrow.style.pointerEvents = showRight ? 'auto' : 'none';
    }

    grid.addEventListener('scroll', updateArrows);
    updateArrows();

    // Add nav arrow styles
    if (!document.getElementById('nav-arrow-styles')) {
        const style = document.createElement('style');
        style.id = 'nav-arrow-styles';
        style.textContent = `
            .scroll-nav-arrow {
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                width: 44px;
                height: 80px;
                background: linear-gradient(90deg, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.3));
                border: none;
                color: rgba(255, 255, 255, 0.8);
                font-size: 32px;
                cursor: pointer;
                z-index: 20;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                border-radius: 4px;
            }
            
            .scroll-nav-arrow:hover {
                color: white;
                background: linear-gradient(90deg, rgba(59, 130, 246, 0.3), rgba(0, 0, 0, 0.3));
            }
            
            .scroll-nav-left {
                left: 0;
                border-radius: 0 4px 4px 0;
            }
            
            .scroll-nav-right {
                right: 0;
                background: linear-gradient(-90deg, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.3));
                border-radius: 4px 0 0 4px;
            }
            
            .scroll-nav-right:hover {
                background: linear-gradient(-90deg, rgba(139, 92, 246, 0.3), rgba(0, 0, 0, 0.3));
            }
        `;
        document.head.appendChild(style);
    }
}

// --- Hover Sound Effects (Visual feedback enhancement) ---
function setupButtonHoverEffects() {
    const buttons = document.querySelectorAll('.btn-personaje');

    buttons.forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            // Add subtle scale pulse on hover
            btn.style.transition = 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)';
        });

        btn.addEventListener('click', () => {
            // Add click ripple effect
            const ripple = document.createElement('div');
            ripple.className = 'click-ripple';
            btn.appendChild(ripple);

            setTimeout(() => ripple.remove(), 600);
        });
    });

    // Add ripple styles
    if (!document.getElementById('ripple-styles')) {
        const style = document.createElement('style');
        style.id = 'ripple-styles';
        style.textContent = `
            .click-ripple {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 10px;
                height: 10px;
                background: rgba(255, 255, 255, 0.4);
                border-radius: 50%;
                transform: translate(-50%, -50%);
                animation: rippleEffect 0.6s ease-out forwards;
                pointer-events: none;
            }
            
            @keyframes rippleEffect {
                to {
                    width: 300px;
                    height: 300px;
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Inicializar todo cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar selección visual
    if (typeof idPersonajeSeleccionado !== 'undefined') {
        seleccionarPersonaje(idPersonajeSeleccionado);
    }

    // Crear partículas del menú
    crearParticulasMenu();

    // Configurar navegación del scroll
    setupScrollNavigation();

    // Configurar efectos de hover
    setupButtonHoverEffects();
});

// ========================================
// SISTEMA DE LOBBY MULTIJUGADOR
// ========================================

var lobbyEstadoListo = false;
var lobbyEsHost = false;

function abrirLobbyMultijugador() {
    document.getElementById('modal-lobby').classList.remove('hidden');

    // Si ya está conectado, mostrar opciones
    if (typeof estaConectado === 'function' && estaConectado()) {
        mostrarPantallaLobby('opciones');
        actualizarEstadoConexion(true);
        actualizarListaSalas();
    } else {
        mostrarPantallaLobby('conexion');
    }
}

function cerrarLobby() {
    document.getElementById('modal-lobby').classList.add('hidden');
}

function mostrarPantallaLobby(pantalla) {
    const pantallas = ['conexion', 'opciones', 'crear', 'unirse', 'sala'];
    pantallas.forEach(p => {
        const el = document.getElementById('lobby-pantalla-' + p);
        if (el) el.classList.add('hidden');
    });

    const activa = document.getElementById('lobby-pantalla-' + pantalla);
    if (activa) activa.classList.remove('hidden');
}

function actualizarEstadoConexion(conectado) {
    const indicador = document.getElementById('lobby-estado-conexion');
    if (!indicador) return;

    if (conectado) {
        indicador.innerHTML = `
            <span class="w-2 h-2 bg-green-500 rounded-full"></span>
            <span class="text-green-400">Conectado</span>
        `;
    } else {
        indicador.innerHTML = `
            <span class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            <span class="text-zinc-400">Desconectado</span>
        `;
    }
}

function conectarYMostrarOpciones() {
    if (typeof conectarServidor !== 'function') {
        alert('Error: Sistema de red no disponible');
        return;
    }

    conectarServidor((resultado) => {
        if (resultado.exito) {
            actualizarEstadoConexion(true);
            mostrarPantallaLobby('opciones');
            actualizarListaSalas();

            // Configurar callbacks de red
            configurarCallbacksLobby();
        } else {
            alert('Error conectando: ' + (resultado.error || 'Servidor no disponible'));
        }
    });
}

function configurarCallbacksLobby() {
    if (typeof networkCallbacks === 'undefined') return;

    networkCallbacks.onJugadorUnido = (data) => {
        actualizarListaJugadoresSala();
    };

    networkCallbacks.onJugadorSalio = (data) => {
        actualizarListaJugadoresSala();
    };

    networkCallbacks.onSalaActualizada = (data) => {
        actualizarListaJugadoresSala();
        verificarTodosListos();
    };

    networkCallbacks.onPartidaIniciando = (data) => {
        console.log('🎮 [UI] Partida iniciando, regenerando mapa con datos del servidor...');

        // IMPORTANTE: Regenerar todo el mundo con el mapa del servidor
        if (data.mapa) {
            // Limpiar el laberinto actual de la escena
            escena.children.filter(obj =>
                obj instanceof THREE.InstancedMesh ||
                (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.PlaneGeometry)
            ).forEach(obj => escena.remove(obj));

            // Regenerar laberinto con el mapa del servidor
            generarLaberinto(); // Ahora usará window.mapaServidor

            // Reinicializar pathfinding con el nuevo mapa
            if (typeof inicializarPathfinder === 'function') {
                inicializarPathfinder();
            }

            // Reinicializar IA táctica
            if (typeof inicializarBotTactico === 'function') {
                inicializarBotTactico();
            }

            // Respawnear entidades en las posiciones correctas
            if (typeof spawnEntidades === 'function') {
                // Limpiar entidades anteriores primero
                if (jugadorObj) escena.remove(jugadorObj);
                if (botObj) escena.remove(botObj);
                spawnEntidades();
            }
        }

        cerrarLobby();
        // Ocultar menú y mostrar HUD
        document.getElementById('overlay').classList.add('hidden');
        document.getElementById('hud-juego').classList.remove('hidden');
        // Iniciar cinemática
        if (typeof iniciarCinematica === 'function') {
            renderizador.domElement.requestPointerLock();
            iniciarCinematica();
        }
    };
}

function mostrarCrearSala() {
    mostrarPantallaLobby('crear');
}

function mostrarUnirseSala() {
    mostrarPantallaLobby('unirse');
}

function volverAOpcionesLobby() {
    mostrarPantallaLobby('opciones');
    actualizarListaSalas();
}

function crearSalaDesdeUI() {
    const nombreInput = document.getElementById('input-nombre-sala');
    const nombre = nombreInput ? nombreInput.value.trim() : 'Sala SIUM';

    if (typeof crearSala !== 'function') {
        alert('Error: Sistema de red no disponible');
        return;
    }

    crearSala(nombre || 'Sala SIUM', (resultado) => {
        if (resultado.exito) {
            lobbyEsHost = true;
            mostrarPantallaLobby('sala');
            mostrarInfoSala(resultado.sala);
        } else {
            alert('Error creando sala: ' + (resultado.error || 'Desconocido'));
        }
    });
}

function unirseSalaDesdeUI() {
    const codigoInput = document.getElementById('input-codigo-sala');
    const codigo = codigoInput ? codigoInput.value.trim().toUpperCase() : '';

    if (!codigo || codigo.length < 4) {
        alert('Ingresa un código de sala válido');
        return;
    }

    if (typeof unirseASala !== 'function') {
        alert('Error: Sistema de red no disponible');
        return;
    }

    unirseASala(codigo, (resultado) => {
        if (resultado.exito) {
            lobbyEsHost = false;
            mostrarPantallaLobby('sala');
            mostrarInfoSala(resultado.sala);
        } else {
            alert('Error uniéndose: ' + (resultado.error || 'Código inválido'));
        }
    });
}

function mostrarInfoSala(sala) {
    // Mostrar código
    const codigoEl = document.getElementById('sala-codigo-mostrar');
    if (codigoEl) codigoEl.textContent = sala.id;

    // Actualizar lista de jugadores
    actualizarListaJugadoresSala();

    // Mostrar/ocultar botón de iniciar (solo host)
    const btnIniciar = document.getElementById('btn-iniciar-partida');
    if (btnIniciar) {
        btnIniciar.classList.toggle('hidden', !lobbyEsHost);
    }
}

function actualizarListaJugadoresSala() {
    const listaEl = document.getElementById('lista-jugadores-sala');
    if (!listaEl) return;

    const sala = typeof obtenerSalaActual === 'function' ? obtenerSalaActual() : null;
    if (!sala) return;

    const miId = typeof obtenerMiId === 'function' ? obtenerMiId() : null;

    listaEl.innerHTML = sala.jugadores.map(j => `
        <div class="flex items-center justify-between bg-zinc-800 rounded px-3 py-2">
            <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full ${j.listo ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}"></span>
                <span class="text-white font-medium">${j.id === miId ? '(Tú)' : ''} ${j.personaje || 'Jugador'}</span>
            </div>
            <span class="text-xs ${j.listo ? 'text-green-400' : 'text-yellow-400'}">
                ${j.listo ? 'LISTO' : 'Esperando...'}
            </span>
        </div>
    `).join('');
}

function toggleListoUI() {
    lobbyEstadoListo = !lobbyEstadoListo;

    const btnListo = document.getElementById('btn-listo');
    if (btnListo) {
        if (lobbyEstadoListo) {
            btnListo.className = 'flex-1 bg-green-600 hover:bg-green-500 text-white font-black py-4 uppercase tracking-widest text-sm transition-colors';
            btnListo.textContent = '✓ Listo';
        } else {
            btnListo.className = 'flex-1 bg-yellow-600 hover:bg-yellow-500 text-black font-black py-4 uppercase tracking-widest text-sm transition-colors';
            btnListo.textContent = 'Estoy Listo';
        }
    }

    if (typeof marcarListo === 'function') {
        marcarListo(lobbyEstadoListo);
    }
}

function verificarTodosListos() {
    const sala = typeof obtenerSalaActual === 'function' ? obtenerSalaActual() : null;
    if (!sala || !lobbyEsHost) return;

    const btnIniciar = document.getElementById('btn-iniciar-partida');
    const todosListos = sala.jugadores.every(j => j.listo) && sala.jugadores.length >= 2;

    if (btnIniciar) {
        btnIniciar.disabled = !todosListos;
        btnIniciar.classList.toggle('opacity-50', !todosListos);
    }
}

function iniciarPartidaDesdeUI() {
    if (!lobbyEsHost) return;

    if (typeof iniciarPartida === 'function') {
        iniciarPartida((resultado) => {
            if (!resultado.exito) {
                alert('Error iniciando partida: ' + (resultado.error || 'No todos están listos'));
            }
        });
    }
}

function salirDeSalaUI() {
    if (typeof salirDeSala === 'function') {
        salirDeSala(() => {
            lobbyEstadoListo = false;
            lobbyEsHost = false;
            mostrarPantallaLobby('opciones');
            actualizarListaSalas();
        });
    }
}

function actualizarListaSalas() {
    if (typeof listarSalas !== 'function') return;

    listarSalas((resultado) => {
        const listaEl = document.getElementById('lista-salas');
        if (!listaEl) return;

        if (!resultado.salas || resultado.salas.length === 0) {
            listaEl.innerHTML = '<p class="text-zinc-500 text-sm text-center py-4">No hay salas disponibles</p>';
            return;
        }

        listaEl.innerHTML = resultado.salas.map(sala => `
            <div class="flex items-center justify-between bg-zinc-800 rounded px-3 py-2 cursor-pointer hover:bg-zinc-700"
                 onclick="document.getElementById('input-codigo-sala').value='${sala.id}'; mostrarUnirseSala();">
                <div>
                    <span class="text-white font-medium">${sala.nombre}</span>
                    <span class="text-zinc-400 text-xs ml-2">${sala.jugadores}/${sala.maxJugadores}</span>
                </div>
                <span class="text-xs text-green-400 font-mono">${sala.id}</span>
            </div>
        `).join('');
    });
}
// ========================================
// SISTEMA DE NOTIFICACIONES / KILL FEED
// ========================================

function mostrarNotificacionCombate(texto, color = 'white') {
    let feedContainer = document.getElementById('combat-feed');
    if (!feedContainer) {
        feedContainer = document.createElement('div');
        feedContainer.id = 'combat-feed';
        feedContainer.className = 'absolute top-24 right-8 flex flex-col items-end gap-2 pointer-events-none z-30';
        document.body.appendChild(feedContainer);
    }

    const item = document.createElement('div');
    item.className = 'glass-light px-4 py-2 border-r-4 border-white animate-slide-in';
    item.style.borderColor = color;
    item.innerHTML = `<span class="text-white font-black italic uppercase text-xs tracking-tighter">${texto}</span>`;

    feedContainer.appendChild(item);

    // Animación de entrada
    if (!document.getElementById('feed-styles')) {
        const style = document.createElement('style');
        style.id = 'feed-styles';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            .animate-slide-in {
                animation: slideInRight 0.3s cubic-bezier(0.23, 1, 0.32, 1) forwards;
            }
            .glass-light {
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(4px);
            }
        `;
        document.head.appendChild(style);
    }

    // Remover después de 4 segundos
    setTimeout(() => {
        item.style.transition = 'all 0.5s ease';
        item.style.opacity = '0';
        item.style.transform = 'translateX(20px)';
        setTimeout(() => item.remove(), 500);
    }, 4000);
}
