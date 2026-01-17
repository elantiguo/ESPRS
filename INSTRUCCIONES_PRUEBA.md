# 🧪 Instrucciones de Prueba - Mapas Sincronizados

## ¿Cómo probar que el problema está resuelto?

### Paso 1: Verificar que el servidor está corriendo
El servidor debe estar ejecutándose en `http://localhost:3000`

### Paso 2: Abrir dos ventanas del navegador
1. Abre tu navegador
2. Ve a `http://localhost:3000` (o donde esté tu juego)
3. Abre una segunda ventana en modo incógnito (o en otro navegador)
4. Ve a `http://localhost:3000` nuevamente

### Paso 3: Crear y unirse a una sala

**En la Ventana 1 (Jugador 1 - Host):**
1. Haz clic en **"MULTIJUGADOR"**
2. Haz clic en **"Conectar al Servidor"**
3. Haz clic en **"Crear Sala"**
4. Tu sala tendrá un código como **"X593XP"** - anótalo
5. Haz clic en **"Estoy Listo"**

**En la Ventana 2 (Jugador 2):**
1. Haz clic en **"MULTIJUGADOR"**
2. Haz clic en **"Conectar al Servidor"**
3. Haz clic en **"Unirse a Sala"**
4. Ingresa el código de la sala del Jugador 1
5. Haz clic en **"Estoy Listo"**

### Paso 4: Iniciar la partida

**En la Ventana 1 (Host):**
- Haz clic en **"INICIAR PARTIDA"**

### Paso 5: Verificar el mapa

¡IMPORTANTE! Ahora viene la verificación:

1. **Observa la consola del navegador** (F12)
   - Deberías ver logs como:
     ```
     🗺️ Mapa recibido del servidor: 17x17
     🎮 [UI] Partida iniciando, regenerando mapa con datos del servidor...
     🗺️ Usando mapa del servidor (multijugador)
     ```

2. **Compara los mapas visualmente**
   - En ambas ventanas, el laberinto debe ser **EXACTAMENTE IGUAL**
   - Las paredes deben estar en las mismas posiciones
   - Los huecos bajos (para agacharse) deben estar en los mismos lugares
   - Los jugadores deben verse mutuamente si están cerca

3. **Prueba el movimiento**
   - Mueve al jugador en la Ventana 1
   - En la Ventana 2, deberías ver al jugador remoto moverse
   - Si el jugador remoto choca con una pared que **TÚ** ves, entonces están sincronizados ✅
   - Si el jugador remoto puede atravesar paredes que tú ves, entonces NO están sincronizados ❌

## ✅ Señales de éxito

- ✔️ Ambos jugadores ven el mismo laberinto
- ✔️ Las colisiones son consistentes entre jugadores
- ✔️ Pueden verse mutuamente cuando están en el mismo pasillo
- ✔️ No hay comportamientos "fantasma" (como jugadores atravesando paredes)

## ❌ Señales de problema

- ❌ Los mapas se ven diferentes
- ❌ Un jugador puede estar en una zona que el otro ve como pared
- ❌ Los jugadores no pueden verse aunque estén en la misma posición
- ❌ Las colisiones no coinciden

## 🔍 Logs de servidor esperados

En la terminal del servidor deberías ver:
```
🗺️ [Room] Mapa generado para sala [CÓDIGO]
🎮 [GameManager] Partida iniciada en sala [CÓDIGO]
```

Si ves estos logs, el servidor está funcionando correctamente.

## 📝 Notas adicionales

- Si el mapa sigue siendo diferente, verifica la consola del navegador
- Asegúrate de que ambos clientes recibieron el evento `partida:iniciando`
- Si hay  algún error, anota exactamente qué dice y repórtalo
