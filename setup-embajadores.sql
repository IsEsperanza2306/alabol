-- ============================================================
-- ALABOL: Tabla de Embajadores + Primer Embajador
-- Ejecutar en: Supabase SQL Editor → https://supabase.com/dashboard/project/rgnunjngtsgqgvplawfr/editor
-- ============================================================

CREATE TABLE IF NOT EXISTS embajadores (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT        UNIQUE NOT NULL,
    nombre      TEXT,
    telefono    TEXT,
    codigo      TEXT        UNIQUE NOT NULL,
    tier        TEXT        DEFAULT 'bronce' CHECK (tier IN ('bronce', 'plata', 'oro')),
    activo      BOOLEAN     DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: cada embajador solo ve su propio registro
ALTER TABLE embajadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "embajador_lee_su_registro"
    ON embajadores FOR SELECT
    USING ( auth.jwt() ->> 'email' = email );

-- ⬇️ PRIMER EMBAJADOR
INSERT INTO embajadores (email, nombre, codigo, tier)
VALUES ('n.seminuevos@gmail.com', 'Seminuevos', 'SEMI001', 'bronce')
ON CONFLICT (email) DO NOTHING;
