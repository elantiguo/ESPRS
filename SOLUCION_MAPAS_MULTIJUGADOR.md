# Solución al Problema de Mapas Diferentes en Multijugador

## 🔍 Problema Identificado

En el modo multijugador, cada jugador estaba generando su propio mapa aleatorio de forma local, lo que resultaba en que cada cliente tuviera un laberinto completamente diferente. Esto imposibilitaba el juego porque los jugadores no podían verse ni interactuar correctamente.

## ✅ Solución Implementada

### 1. **Generación del mapa en el servidor** (`servidor/game/Room.js`)

Se agregó:
- Una propiedad `mapa` en la clase `Room` para almacenar el laberinto generado
- Un método `generarMapa()` que crea el laberinto usando el mismo algoritmo del cliente
- Uso de una **semilla (seed)** basada en el ID de la sala para generar mapas únicos pero reproducibles
- Llamada a `generarMapa()` en el método `iniciarPartida()` para crear el mapa cuando comienza la partida

```javascript
// El mapa se genera UNA SOLA VEZ en el servidor cuando inicia la partida
this.generarMapa();
```

### 2. **Envío del mapa a los clientes** (`servidor/network/SocketHandler.js`)

Se modificó el evento `partida:iniciando` para incluir el mapa generado:

```javascript
this.io.to(player.salaId).emit('partida:iniciando', {
    sala: resultado.sala,
    mapa: sala.mapa  // ¡IMPORTANTE! Enviar el mapa
});
```

### 3. **Recepción del mapa en el cliente** (`juego/js/network.js`)

Se modificó el handler del evento `partida:iniciando` para guardar el mapa del servidor:

```javascript
if (data.mapa) {
    window.mapaServidor = data.mapa;
    console.log('🗺️ Mapa recibido del servidor');
}
```

### 4. **Uso del mapa sincronizado** (`juego/js/laberinto.js`)

Se modificó la función `generarLaberinto()` para:
- **Modo Multijugador**: Usar el mapa recibido del servidor
- **Modo Individual**: Generar un mapa aleatorio local

```javascript
function generarLaberinto() {
    if (typeof window !== 'undefined' && window.mapaServidor) {
        // Usar mapa del servidor (multijugador)
        laberinto = JSON.parse(JSON.stringify(window.mapaServidor));
        window.mapaServidor = null;
    } else {
        // Generar mapa local (modo individual)
        // ... código de generación aleatoria ...
    }
}
```

## 🎮 Cómo Funciona Ahora

1. **El host crea una sala** y marca listo
2. **Otro jugador se une** y marca listo
3. **El host inicia la partida**
4. **El servidor genera el mapa** usando una semilla única
5. **El servidor envía el mismo mapa a todos los clientes**
6. **Todos los clientes cargan el mismo laberinto** en su escena 3D
7. **¡Ahora todos ven el mismo mapa y pueden jugar juntos!**

## 📊 Ventajas de Esta Solución

✅ **Sincronización perfecta**: Todos los jugadores tienen exactamente el mismo mapa  
✅ **Reproducible**: El mismo código de sala siempre genera el mismo mapa  
✅ **Sin conflictos**: El servidor es la autoridad del mapa  
✅ **Backward compatible**: El modo individual sigue funcionando con generación local  
✅ **Eficiente**: Solo se transmite el mapa una vez al inicio

## 🧪 Cómo Probar

1. Asegúrate de que el servidor esté corriendo:
   ```bash
   cd servidor
   node server.js
   ```

2. Abre dos ventanas del navegador en `http://localhost:3000` (o donde esté tu juego)

3. En la primera ventana:
   - Conecta al servidor
   - Crea una sala
   - Marca listo

4. En la segunda ventana:
   - Conecta al servidor
   - Únete a la sala usando el código
   - Marca listo

5. El host inicia la partida

6. **¡Verifica que ambos jugadores vean el mismo laberinto!**

## 🔧 Archivos Modificados

- ✏️ `servidor/game/Room.js` - Generación del mapa en el servidor
- ✏️ `servidor/network/SocketHandler.js` - Envío del mapa a los clientes
- ✏️ `juego/js/network.js` - Recepción y almacenamiento del mapa
- ✏️ `juego/js/laberinto.js` - Uso del mapa sincronizado

## 📝 Notas Técnicas

- El mapa es un array 2D de 17x17 donde:
  - `0` = Pasillo libre
  - `1` = Pared sólida
  - `2` = Hueco bajo (requiere agacharse)

- El generador de números pseudoaleatorios con semilla (`seededRandom`) garantiza que el mismo código de sala genere siempre el mismo mapa

- La copia profunda (`JSON.parse(JSON.stringify())`) se usa para evitar que los clientes modifiquen el mapa original
