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
