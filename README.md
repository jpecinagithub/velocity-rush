# VELOCITY RUSH

Juego de carreras arcade 3D para el navegador. 100% original, sin backend:
todo funciona en el cliente con `npm install` + `npm run dev`.

- **Stack:** Vite, React, JavaScript, Three.js + React Three Fiber, Web Audio API, Gamepad API.
- **Sin dependencias de pago, sin cuentas, sin placeholders:** menús, física,
  IA, tráfico, sonido y persistencia son reales y funcionales.

## Modos de juego

| Modo | Descripción |
|---|---|
| **Circuito** | 3 vueltas contra 5 rivales IA, con checkpoints, posiciones en vivo y clasificación final. |
| **Sprint en autopista** | De punto a punto entre tráfico denso, con checkpoints. |
| **Contrarreloj** | En solitario, 3 vueltas; tu mejor vuelta se guarda en localStorage. |

## Coches (6) y circuitos (3)

- **Coches:** VORTEX S, FALCON X, DART RS, MAMMOTH GT, SYLPH R y el hipercoche desbloqueable **APEX ONE** (gana cualquier carrera para desbloquearlo).
- **Circuitos:** AZURE COAST (costa), THUNDER RIDGE (montaña), NEON BAY (ciudad nocturna de neón).

## Controles

**Teclado:** W/↑ acelerar · S/↓ frenar · A/D o ←/→ girar · Espacio derrape ·
Shift nitro · C cámara · R recolocar · P o Esc pausa · Enter confirmar.

**Mando compatible PlayStation:** stick izquierdo girar · R2 acelerar ·
L2 frenar · ✕ nitro · ▢ derrape · △ cámara · ○ atrás · Options pausa.
El mando funciona también en los menús (cruz/stick + ✕/○).

## Puesta en marcha

```bash
npm install
npm run dev      # abre http://localhost:5173
```

Otros comandos:

```bash
npm run build    # compila a dist/
npm test         # 41 pruebas de lógica headless (pistas, física, IA, carreras)
```

## Notas técnicas

- Física arcade propia (sin motor externo): derrape controlado, nitro,
  rebufo (slipstream) con impulso al salir, colisiones coche-coche y con
  muros, tierra que frena, saltos, y recolocación si te quedas atascado.
- IA con 3 dificultades (Fácil / Normal / Difícil), 5 pilotos con estilos
  propios y goma elástica suave (sin teletransporte).
- Cámara de persecución con 3 posiciones (tecla C), sacudida configurable.
- Audio 100% sintetizado con Web Audio (motor, derrapes, nitro, cuenta atrás,
  música de menú y de carrera). Se activa con el primer clic/tecla por la
  política de autoplay de los navegadores.
- Calidad gráfica automática (alta/media/baja) según el hardware, con ajuste
  en marcha si los fps caen. Todo el progreso, ajustes y récords viven en
  `localStorage` (clave `velocity-rush:*`).
- Página de autoprueba: abre `?autotest=1` para la batería de validación
  automática en el navegador.

## Estructura

```
src/
  game/      motor: pista, física, IA, tráfico, sesión, cámara, partículas, audio
  data/      coches, circuitos, ajustes (localStorage)
  ui/        pantallas, HUD, lienzo R3F, navegación por mando/teclado
  autotest/  batería de validación en el navegador (?autotest=1)
test/        pruebas de lógica headless (npm test)
```
