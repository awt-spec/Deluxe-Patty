# Asistente IA para corredores — Deluxe Properties

Asistente por WhatsApp multicliente (Next.js + Supabase + Vercel + API de Claude).
Ver `CLAUDE.md` para reglas, datos y comandos.

## Arranque local
1. `npm install`
2. Copiar `.env.example` a `.env.local` y completar.
3. `npm run dev`

## Base de datos
- Migraciones: `supabase/migrations/` (aplicar con `supabase db push`).
- Semilla: `supabase/seed.sql` (Deluxe Properties con propiedades de ejemplo).
- Pruebas: `PGHOST=... PGPORT=... npm run test:db`.
