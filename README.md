# ⚽🏆 CALICAS 2026

Quiniela del Mundial **FIFA 2026** entre amigos, con sabor rojiamarillo del Club Sport Herediano.

🌐 **Producción:** https://calicas-2026.vercel.app

- Pronósticos para cada partido a partir del lunes 15 de junio.
- Datos en tiempo real desde la API pública [worldcup26.ir](https://worldcup26.ir/api-docs/) (sin auth).
- Horarios mostrados en zona horaria de Costa Rica (`America/Costa_Rica`).
- Acceso por correo electrónico (sin contraseña).
- Tabla de posiciones general en tiempo real + ganadores por fase.
- Fases que se desbloquean conforme termina la fase anterior.
- Optimizado para móvil.

## Estado del despliegue
- ✅ App en Vercel: `calicas-2026.vercel.app` (proyecto `miguel-fuentes-s-projects/calicas-2026`).
- ✅ Variables de entorno configuradas en Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `WC_API_BASE`).
- ✅ Schema aplicado en Supabase ED26 (5 tablas/vista, 104 partidos seedeados).
- ✅ Cron de Vercel diario a las 12:00 UTC sobre `/api/sync` (límite del plan Hobby = 1×/día). El frontend hace polling adicional cada minuto.

## Stack
- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Supabase (DB + Realtime, proyecto **ED26** = `oxhkgtcqbsgjzagpziee`)
- Vercel (deploy + cron de sincronización)
- Fuente de datos: [worldcup26.ir](https://worldcup26.ir/api-docs/) — REST público sin API key

## Configuración local

`.env.local` ya está poblado con el proyecto ED26.

```bash
npm install
npm run dev   # http://localhost:3000
```

## Reglas de puntuación
| Caso | Puntos |
|---|---|
| 🎯 Marcador exacto | 5 |
| ✅ Resultado correcto + un marcador acertado | 3 |
| ✅ Sólo resultado correcto (1/X/2) | 2 |
| ❌ Errado | 0 |
| 🔥 De **octavos** en adelante | x2 |

## Estructura

```
src/
  app/
    page.tsx                  # Login (email-only)
    (app)/
      layout.tsx              # Tab bar + header
      dashboard/page.tsx      # Inicio: resumen, en vivo, próximos
      matches/page.tsx        # Partidos por fase + predicciones
      leaderboard/page.tsx    # Tabla general + ganadores por fase
      profile/page.tsx        # Editar perfil
    api/sync/route.ts         # Cron: sync API + recálculo de puntos
  lib/
    supabase.ts               # Cliente Supabase
    worldcup-api.ts           # Cliente worldcup26.ir (con TLS legacy renegot.)
    time.ts                   # Conversión de tz a CR
    scoring.ts                # Sistema de puntos
    session.ts                # Auth lite (localStorage)
supabase/schema.sql           # Tablas + vista + RLS
scripts/migrate.mjs           # Migración con DATABASE_URL
vercel.json                   # Cron de sync
```

## Diseño
- Paleta Mundial 2026: rojo `#E40521`, azul `#1E3A8A`, verde `#00A651`, dorado `#FFC72C`.
- Acentos Herediano: rojo `#D72027` + amarillo `#FFD400`.
- Mobile-first, modo oscuro por defecto, tab bar inferior.

## Re-deploy
```bash
vercel deploy --prod --yes
```

¡Que gane el mejor calicas! 🦁🟥🟨


## Stack
- Next.js 15 (App Router) + TypeScript + Tailwind v4
- Supabase (base de datos + Realtime)
- Vercel (deploy + cron de sincronización)

## Configuración

### 1. Variables de entorno
Ya están en `.env.local` apuntando al proyecto Supabase **ED26**.

```env
NEXT_PUBLIC_SUPABASE_URL=https://oxhkgtcqbsgjzagpziee.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
WC_API_BASE=https://worldcup26.ir
```

Para Vercel: copiá esas mismas variables al panel del proyecto.
Opcional para mayor seguridad en `/api/sync`: agregá `SUPABASE_SERVICE_ROLE_KEY`.

### 2. Crear las tablas en Supabase

Tenés **dos formas** de aplicar el esquema al proyecto ED26:

**Opción A — SQL editor (la más fácil, no requiere credenciales extra):**
1. Abrí https://supabase.com/dashboard/project/oxhkgtcqbsgjzagpziee/sql/new
2. Copiá todo el contenido de `supabase/schema.sql`.
3. Pegá y ejecutá. Listo.

**Opción B — script `npm run migrate`:**
1. Buscá la connection string del pooler en el dashboard de Supabase
   (`Project Settings → Database → Connection string → URI`).
2. Exportala y corré:
```bash
$env:DATABASE_URL="postgresql://postgres.oxhkgtcqbsgjzagpziee:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
npm run migrate
```

Las tablas usan el prefijo `ed26_calicas_` para no chocar con otras apps del proyecto ED26.

### 3. Instalar y correr
```bash
npm install
npm run dev
```

### 4. Deploy en Vercel
```bash
vercel --prod
```
El `vercel.json` ya programa un cron cada 5 minutos a `/api/sync`, que:
- Sincroniza partidos desde worldcup26.ir.
- Recalcula los puntos de todos los pronósticos.
- Determina ganadores por fase cuando una fase queda completa.

## Reglas de puntuación
| Caso | Puntos |
|---|---|
| 🎯 Marcador exacto | 5 |
| ✅ Resultado correcto + un marcador acertado | 3 |
| ✅ Sólo resultado correcto (1/X/2) | 2 |
| ❌ Errado | 0 |
| 🔥 De **octavos** en adelante | x2 |

## Estructura

```
src/
  app/
    page.tsx                  # Login (email-only)
    (app)/
      layout.tsx              # Tab bar + header
      dashboard/page.tsx      # Inicio: resumen, en vivo, próximos
      matches/page.tsx        # Partidos por fase + predicciones
      leaderboard/page.tsx    # Tabla general + ganadores por fase
      profile/page.tsx        # Editar perfil
    api/sync/route.ts         # Cron: sync API + recálculo de puntos
  lib/
    supabase.ts               # Cliente Supabase
    worldcup-api.ts           # Cliente worldcup26.ir
    time.ts                   # Conversión de tz a CR
    scoring.ts                # Sistema de puntos
    session.ts                # Auth lite (localStorage)
supabase/schema.sql           # Tablas + vista + RLS
vercel.json                   # Cron de sync
```

## Diseño
- Paleta Mundial 2026: rojo `#E40521`, azul `#1E3A8A`, verde `#00A651`, dorado `#FFC72C`.
- Acentos Herediano: rojo `#D72027` + amarillo `#FFD400`.
- Mobile-first, modo oscuro por defecto, tab bar inferior.

## Fuente de datos
[worldcup26.ir](https://worldcup26.ir/api-docs/) — API REST pública, gratis, sin API key, con datos en vivo de los 104 partidos del Mundial FIFA 2026.
- `GET /get/games` — partidos + scores en vivo
- `GET /get/teams` — 48 selecciones
- `GET /get/stadiums` — 16 estadios

¡Que gane el mejor calicas! 🦁🟥🟨
