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

    // Reset borders
    const btnAgente = document.getElementById('btn-p-agente');
    const btnCill = document.getElementById('btn-p-cill');
    const btnRufy = document.getElementById('btn-p-rufy');

    if (btnAgente) btnAgente.classList.remove('border-blue-500', 'bg-blue-500/10');
    if (btnCill) btnCill.classList.remove('border-yellow-500', 'bg-yellow-500/10');
    if (btnRufy) btnRufy.classList.remove('border-pink-500', 'bg-pink-500/10');

    // Set active
    const btn = document.getElementById('btn-p-' + id);
    if (btn) {
        if (id === 'agente') btn.classList.add('border-blue-500', 'bg-blue-500/10');
        if (id === 'cill') btn.classList.add('border-yellow-500', 'bg-yellow-500/10');
        if (id === 'rufy') btn.classList.add('border-pink-500', 'bg-pink-500/10');
    }

    console.log("Personaje seleccionado:", p.nombre);
}

// Inicializar selección visual al cargar
document.addEventListener('DOMContentLoaded', () => {
    if (typeof idPersonajeSeleccionado !== 'undefined') {
        seleccionarPersonaje(idPersonajeSeleccionado);
    }
});
