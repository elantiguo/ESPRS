function actualizarUI() {
    const rol = document.getElementById('rol-jugador');
    if (cazadorId === 1) {
        rol.innerText = "🎯 ERES EL CAZADOR";
        rol.className = "text-yellow-400 font-black animate-pulse";
    } else {
        rol.innerText = "🏃 ¡ESCAPA DEL BOT!";
        rol.className = "text-red-500 font-black";
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
    document.getElementById('overlay').classList.remove('hidden');
    document.querySelector('h1').innerText = res;

    // Limpiar balas al terminar
    proyectilesSium.forEach(p => escena.remove(p.mesh));
    proyectilesSium = [];
}

function onResize() {
    camara.aspect = window.innerWidth / window.innerHeight;
    camara.updateProjectionMatrix();
    renderizador.setSize(window.innerWidth, window.innerHeight);
}
