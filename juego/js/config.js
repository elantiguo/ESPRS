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
var teclas = {};
var linterna;

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
var botAnimaciones = {};    // Clip de animaciones del bot {caminar: [], parado: []}
var botModelo = null;       // Modelo 3D del bot
var botMoviendo = false;    // Estado de movimiento del bot
var botArmaObj = null;      // Referencia al arma del bot para ocultarla

// ========================================
// SISTEMA DE CÁMARA PRIMERA/TERCERA PERSONA
// ========================================
var terceraPersona = false;     // Modo de cámara actual
var jugadorObj = null;          // Grupo contenedor del jugador para tercera persona
var jugadorModelo = null;       // Modelo 3D del jugador
var jugadorMixer = null;        // AnimationMixer del jugador
var jugadorAnimaciones = {};    // Animaciones del jugador {caminar: [], parado: []}
var jugadorMoviendo = false;    // Estado de movimiento del jugador
var jugadorArmaObj = null;      // Referencia al arma del jugador para ocultarla
var posicionJugador = { x: 0, y: 2, z: 0 }; // Posición real del jugador
var distanciaCamara = 5;        // Distancia de la cámara en tercera persona
var alturaCamara = 3;           // Altura de la cámara en tercera persona
