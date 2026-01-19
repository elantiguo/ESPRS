# 📱 Plan de Optimización de Rendimiento para Dispositivos Móviles

## Estado Actual (Enero 2026)

### ✅ Optimizaciones Ya Implementadas

| ID | Optimización | Archivo | Estado |
|----|-------------|---------|--------|
| CB-34 | Sombras desactivadas en móviles | main.js | ✅ |
| CB-46 | Sin antialiasing en todos los dispositivos | main.js | ✅ |
| CB-47 | GPU de alto rendimiento preferida | main.js | ✅ |
| CB-48 | Stencil buffer desactivado | main.js | ✅ |
| CB-49 | Resolución reducida (75%) en móviles | main.js | ✅ |
| CB-50 | Fog desactivado en móviles | main.js | ✅ |
| CB-51 | Bot oculto si distancia > 20m | main.js | ✅ |
| CB-65 | Linterna desactivada en móviles | main.js | ✅ |
| CB-71 | Frame rate limitado a 30 FPS | main.js | ✅ |
| CB-45 | Animaciones actualizadas cada 3 frames | main.js | ✅ |
| CB-32 | LOD de animación más agresivo (10m) | main.js | ✅ |
| CB-62 | Pool de proyectiles reducido (10) | pool.js | ✅ |
| CB-63 | Colisiones cada 2 frames | pool.js | ✅ |
| CB-64 | Sin flashes de disparo | pool.js | ✅ |
| CB-70 | TTL de cache más largo | cache.js | ✅ |
| CB-10 | Colisión zero-allocation | laberinto.js | ✅ |
| CB-68 | Esquive de bot desactivado | bot-tactico.js | ✅ |
| CB-69 | Predicción de jugador desactivada | bot-tactico.js | ✅ |

---

## 🚀 Optimizaciones Implementadas HOY

### OPT-02: Eliminar PointLights en Entidades Móviles ✅
**Archivo:** `entidades.js`
**Impacto:** ⭐⭐⭐ Alto
**Descripción:** Las PointLights de jugador y bot ahora solo se crean en PC. En móviles no se agregan luces dinámicas a las entidades.

### OPT-03: Materiales Simplificados para Móviles ✅
**Archivo:** `laberinto.js`
**Impacto:** ⭐⭐⭐ Alto
**Descripción:** En móviles se usa MeshBasicMaterial en lugar de MeshStandardMaterial. Los materiales básicos no requieren cálculos de iluminación, reduciendo drásticamente la carga del fragment shader.

### OPT-05: Sombras Desactivadas en Meshes ✅
**Archivo:** `laberinto.js`
**Impacto:** ⭐⭐ Medio
**Descripción:** Las meshes del laberinto y suelo tienen castShadow y receiveShadow desactivados en móviles.

### OPT-11: Reducir Frecuencia de Red ✅
**Archivo:** `main.js`
**Impacto:** ⭐⭐ Medio
**Descripción:** La frecuencia de envío de posición se reduce a 150ms en móviles (vs 100ms en PC) para ahorrar batería y datos.

### OPT-12: Menú 3D Optimizado ✅
**Archivo:** `menu-3d.js`
**Impacto:** ⭐⭐ Medio
**Descripción:** Los visores 3D del menú usan antialiasing desactivado, pixelRatio 1, y powerPreference 'low-power' en móviles.

### OPT-13: Throttle de Animación del Menú ✅
**Archivo:** `menu-3d.js`
**Impacto:** ⭐ Bajo
**Descripción:** Las animaciones del menú 3D se renderizan a 20 FPS en móviles para ahorrar batería.

---

## 📋 Optimizaciones Pendientes (Para Futuras Mejoras)

### OPT-01: Frustum Culling Manual para Geometría del Laberinto
**Archivo:** `laberinto.js`
**Impacto:** ⭐⭐⭐ Alto
**Descripción:** Dividir el laberinto en chunks 3x3 y solo renderizar los visibles dentro del frustum de la cámara.

### OPT-04: Geometry Instancing para Tiles Repetidos
**Archivo:** `laberinto.js`
**Impacto:** ⭐⭐ Medio
**Descripción:** Usar THREE.InstancedMesh para reducir draw calls en paredes repetidas.

### OPT-08: Reducir Waypoints de Patrulla
**Archivo:** `bot-tactico.js`
**Impacto:** ⭐ Bajo
**Descripción:** Menos waypoints = menos cálculos de pathfinding.

### OPT-09: Dispose Agresivo de Geometrías
**Archivo:** `laberinto.js`, `entidades.js`
**Impacto:** ⭐⭐ Medio
**Descripción:** Liberar memoria de geometrías no usadas inmediatamente.

---

## 🔧 Métricas de Rendimiento Objetivo

| Métrica | Antes | Después (Estimado) |
|---------|-------|-------------------|
| FPS (Móvil Gama Media) | ~25-30 | 30-35 estable |
| FPS (Móvil Gama Baja) | ~15-20 | 25+ |
| Tiempo de Carga | ~5s | ~3-4s |
| Uso de Batería (menú) | Alto | Medio |
| Draw Calls (juego) | ~50 | ~30 |

---

## 📝 Notas de Implementación

### Detección de Dispositivo Móvil
El proyecto usa la variable global `esDispositivoTactil` para detectar dispositivos móviles.
Todas las optimizaciones verifican esta variable antes de aplicarse.

### Testing Recomendado
Probar en:
- Android Chrome (Gama media: Samsung A52, Xiaomi Redmi Note 10)
- iOS Safari (iPhone 11 o posterior)
- Android WebView (Tauri App)
- iOS WKWebView (Tauri App)

### Consideraciones de Tauri
El proyecto tiene configuración Tauri para build nativo. Las optimizaciones están
diseñadas para funcionar tanto en navegador como en la app nativa.

### Resumen de Cambios Aplicados Hoy
1. **entidades.js** - Sin PointLights en móviles
2. **laberinto.js** - MeshBasicMaterial + Sin sombras en móviles
3. **main.js** - Throttle de red aumentado a 150ms
4. **menu-3d.js** - Renderizado optimizado + 20 FPS
