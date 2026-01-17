// --- Configuración Sium Engine ---
var escena, camara, renderizador, reloj;
var laberinto = [];
const DIMENSION = 17;
const ESCALA = 6;
var botObj, grupoArma;
var cazadorId = 1;
var tiempo = 30;
var activo = false;
var juegoTerminado = false;
var enCinematica = false;       // Nuevo: modo cinemática antes de empezar
var tiempoCinematica = 10;      // Nuevo: duración de la cinemática
var faseCinematica = 0;         // 0: Countdown, 1: Recorrido Mapa
var teclas = {};
var linterna;

// --- Sistema de Salud ---
const VIDA_MAXIMA = 100;
var vidaJugador = VIDA_MAXIMA;
var vidaBot = VIDA_MAXIMA;
const DANO_PROYECTIL = 20; // Daño base inicial

// ========================================
// SELECCIÓN DE PERSONAJES
// ========================================
var personajesSium = {
    'agente': {
        id: 'agente',
        nombre: 'AGENTE',
        desc: 'Ex-agente de operaciones encubiertas. Condenado por 47 asesinatos selectivos.',
        modelos: {
            caminar: 'modelos/personajes/caminar.fbx',
            parado: 'modelos/personajes/parado.fbx',
            agachado: 'modelos/personajes/agachado.fbx',
            disparo: 'modelos/personajes/disparando_pistola_parado.fbx'
        }
    },
    'cill': {
        id: 'cill',
        nombre: 'CILL',
        desc: 'Experimento genético fallido. Eliminó a todos sus creadores.',
        modelos: {
            caminar: 'modelos/personajes/cill_caminar.fbx',
            parado: 'modelos/personajes/cill_parada.fbx',
            agachado: 'modelos/personajes/cill_agachada.fbx',
            disparo: 'modelos/personajes/cill_disparando_pistola_parada.fbx'
        }
    },
    'rufy': {
        id: 'rufy',
        nombre: 'RUFY',
        desc: 'Híbrido de conejo. Asesina silenciosa con 200+ víctimas confirmadas.',
        modelos: {
            caminar: 'modelos/personajes/rufy_caminar.fbx',
            parado: 'modelos/personajes/rufy_parada.fbx',
            agachado: 'modelos/personajes/rufy_agachada.fbx',
            disparo: 'modelos/personajes/rufy_parada_disparando_pistola.fbx'
        }
    },
    'ivan': {
        id: 'ivan',
        nombre: 'IVAN',
        desc: 'Mercenario fantasma. Nadie sabe cuántos ha matado en las sombras.',
        modelos: {
            caminar: 'modelos/personajes/ivan_caminar.fbx',
            parado: 'modelos/personajes/ivan_parado.fbx',
            agachado: 'modelos/personajes/ivan_agachado.fbx',
            disparo: 'modelos/personajes/ivan_paraoa_disparando_pistola.fbx'
        },
        textura: 'modelos/personajes/ivan_textura.png'
    },
    'nero': {
        id: 'nero',
        nombre: 'NERO',
        desc: 'Bestia mitad león. Condenado por masacrar a una colonia entera.',
        modelos: {
            caminar: 'modelos/personajes/nero_caminar.fbx',
            parado: 'modelos/personajes/nero_parado.fbx',
            agachado: 'modelos/personajes/nero_agachado.fbx',
            disparo: 'modelos/personajes/nero_disparando_pistola_parada.fbx'
        }
    },
    'drina': {
        id: 'drina',
        nombre: 'DRINA',
        desc: 'Sangre de dragón en sus venas. Incineró ciudades por diversión.',
        modelos: {
            caminar: 'modelos/personajes/drina_caminar.fbx',
            parado: 'modelos/personajes/drina_parada.fbx',
            agachado: 'modelos/personajes/drina_agachada.fbx',
            disparo: 'modelos/personajes/drina_disparando_pistola_parada.fbx'
        }
    },
    'carpincho': {
        id: 'carpincho',
        nombre: 'CARPINCHO',
        desc: 'Apariencia pacífica, corazón asesino. El más letal de todos.',
        modelos: {
            caminar: 'modelos/personajes/carpincho_caminando.fbx',
            parado: 'modelos/personajes/carpincho_parado.fbx',
            agachado: 'modelos/personajes/carpincho_agachado.fbx',
            disparo: 'modelos/personajes/carpincho_disparando_pistola_parado.fbx'
        }
    }
};

var idPersonajeSeleccionado = localStorage.getItem('sium_personaje_id') || 'agente';
var idPersonajeCargado = idPersonajeSeleccionado;

// Escala de los personajes (agregado para ajuste fácil)
var ESCALA_PERSONAJE = 0.001;
var ESCALA_AGACHADO = 0.00075;

// Radios de colisión
const RADIO_JUGADOR = 0.8;
const RADIO_BOT = 0.8;

// Lista de proyectiles activos Sium
var proyectilesSium = [];

// Variables FPS
var yaw = 0, pitch = 0;
const sensiblidad = 0.002;
var balanceoArma = 0;

// Flag para evitar que Escape reanude inmediatamente al pausar
var puedeReanudar = false;

// ========================================
// SISTEMA DE ANIMACIONES DE PERSONAJES
// ========================================
var botMixer = null;        // AnimationMixer del bot
var botAnimaciones = {};    // Clip de animaciones del bot {caminar: [], parado: [], agachado: [], disparar: []}
var botModelo = null;       // Modelo 3D del bot
var botMoviendo = null;    // Estado de movimiento del bot
var botAgachado = null;    // Estado de agachado del bot
var botArmaObj = null;      // Referencia al arma del bot para ocultarla

// ========================================
// SISTEMA DE CÁMARA PRIMERA/TERCERA PERSONA
// ========================================
var terceraPersona = false;     // Modo de cámara actual
var jugadorObj = null;          // Grupo contenedor del jugador para tercera persona
var jugadorModelo = null;       // Modelo 3D del jugador
var jugadorMixer = null;        // AnimationMixer del jugador
var jugadorAnimaciones = {};    // Animaciones del jugador {caminar: [], parado: [], agachado: [], disparar: []}
var jugadorMoviendo = null;    // Estado de movimiento del jugador
var jugadorAgachado = null;    // Estado de agachado del jugador
var jugadorArmaObj = null;      // Referencia al arma del jugador para ocultarla
var jugadorContenedor = null;   // Contenedor de rotación del jugador
var jugadorPuedeDisparar = true; // Control de cadencia de tiro
var jugadorDisparando = false;  // Indica si el jugador está disparando (para rotación)
var botContenedor = null;       // Contenedor de rotación del bot
var posicionJugador = { x: 0, y: 2, z: 0 }; // Posición real del jugador
var distanciaCamara = 5;        // Distancia de la cámara en tercera persona
var alturaCamara = 4;           // Altura de la cámara en tercera persona

// ========================================
// ROTACIÓN DE MODELOS FBX (ajustar aquí)
// ========================================
// Rotación para animación CAMINAR
var caminarRotacionX = 0;  // Probar: 0, Math.PI/2, -Math.PI/2, Math.PI
var caminarRotacionY = 0;
var caminarRotacionZ = 0;

// Rotación para animación PARADO
var paradoRotacionX = 0;   // Probar: 0, Math.PI/2, -Math.PI/2, Math.PI
var paradoRotacionY = 0;
var paradoRotacionZ = 0;

// Rotación para animación AGACHADO
var agachadoRotacionX = 0;
var agachadoRotacionY = 0;
var agachadoRotacionZ = 0;

// ========================================
// THROTTLE PARA OPTIMIZACIÓN (Fase 5)
// ========================================
var _lastUIUpdate = 0;          // Último tiempo de actualización de UI
var _uiThrottleMs = 100;        // Actualizar UI cada 100ms (no cada frame)
var _lastRelojValue = -1;       // Cache del valor del reloj

// ========================================
// POOL DE VECTORES REUTILIZABLES (Optimización)
// ========================================
// Evita crear nuevos Vector3 cada frame
var _vecForward = null;   // Dirección forward del jugador
var _vecRight = null;     // Dirección derecha del jugador  
var _vecNextPos = null;   // Siguiente posición calculada
var _vecTarget = null;    // Posición objetivo para linterna
var _vecCamOffset = null; // Offset de cámara en tercera persona
var _vecJugador = null;   // Posición del jugador como Vector3

// Inicializar vectors (llamar después de que THREE.js cargue)
function initVectorPool() {
    _vecForward = new THREE.Vector3();
    _vecRight = new THREE.Vector3();
    _vecNextPos = new THREE.Vector3();
    _vecTarget = new THREE.Vector3();
    _vecCamOffset = new THREE.Vector3();
    _vecJugador = new THREE.Vector3();
}
