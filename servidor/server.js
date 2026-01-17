/**
 * SIUM DUEL - Servidor Multijugador
 * Fase 2: Servidor Base Completo
 */

const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');

// Importar módulos del juego
const GameManager = require('./game/GameManager');
const SocketHandler = require('./network/SocketHandler');

// ========================================
// CONFIGURACIÓN DEL SERVIDOR
// ========================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Servir archivos estáticos del juego
app.use(express.static(path.join(__dirname, '..', 'juego')));

// API REST básica
app.get('/api/status', (req, res) => {
    res.json({
        servidor: 'SIUM DUEL',
        version: '2.0',
        estado: 'activo',
        stats: gameManager.obtenerEstadisticas()
    });
});

app.get('/api/salas', (req, res) => {
    res.json({
        salas: gameManager.listarSalasDisponibles()
    });
});

// ========================================
// INICIALIZAR SISTEMA DE JUEGO
// ========================================
const gameManager = new GameManager();
const socketHandler = new SocketHandler(io, gameManager);

// ========================================
// INICIAR SERVIDOR
// ========================================
const PUERTO = process.env.PORT || 3000;

server.listen(PUERTO, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║          🎮 SIUM DUEL - SERVIDOR v2.0            ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  🚀 Servidor:    http://localhost:${PUERTO}            ║`);
    console.log('║  📡 WebSocket:   Activo                          ║');
    console.log('║  🏠 Salas:       Sistema habilitado              ║');
    console.log('║  ⚔️  Combate:     Validación en servidor          ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log('📋 Endpoints API:');
    console.log(`   GET /api/status - Estado del servidor`);
    console.log(`   GET /api/salas  - Listar salas disponibles`);
    console.log('');
});

// Manejo de errores
process.on('uncaughtException', (err) => {
    console.error('❌ Error no capturado:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Promesa rechazada:', err);
});
