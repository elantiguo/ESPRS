// ========================================
// SISTEMA DE AUDIO - SIUM DUEL
// ========================================

var musicaMenu = null;
var musicaIniciada = false;

function inicializarAudio() {
    if (musicaMenu) return;

    musicaMenu = new Audio('audio/musica/inicio/Celdas-de-Hormigón.ogg');
    musicaMenu.loop = true;
    musicaMenu.volume = 0.5;

    // Intentar reproducir en cualquier clic del usuario si estamos en el menú y no está sonando
    document.addEventListener('click', () => {
        if (!activo && (!musicaMenu || musicaMenu.paused)) {
            reproducirMusicaMenu();
        }
    }, { once: false });
}

function reproducirMusicaMenu() {
    if (!musicaMenu) inicializarAudio();

    musicaMenu.play()
        .then(() => {
            musicaIniciada = true;
            console.log("🔊 Música de inicio activada");
        })
        .catch(error => {
            console.warn("🔇 Error al reproducir música:", error);
        });
}

function detenerMusicaMenu() {
    if (musicaMenu) {
        musicaMenu.pause();
        // Opcional: bajar volumen gradualmente
    }
}

function ajustarVolumenMusica(volumen) {
    if (musicaMenu) {
        musicaMenu.volume = volumen;
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    inicializarAudio();
});
