-- WhatsApp Business (petició de 2026-10-16): enviament des del número del casal amb
-- l'API oficial de WhatsApp Business de Meta (Cloud API).
-- - El testimoni d'accés a Meta i el secret de l'app són secrets del Worker
--   (WHATSAPP_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN): mai a la base de dades.
-- - Cada casal té el seu número (phone_number_id de Meta) i el pot activar o desactivar.
-- - No es desa cap telèfon ni el text que respon la persona: el telèfon es llegeix de la
--   sol·licitud en el moment d'enviar, i de la resposta només es desa que n'hi ha hagut
--   (o el botó premut a l'oferta de plaça).

CREATE TABLE whatsapp_config (
  casal_id             TEXT PRIMARY KEY REFERENCES casals (id),
  phone_number_id      TEXT NOT NULL CHECK (length(phone_number_id) BETWEEN 5 AND 40),
  numero_visible       TEXT CHECK (numero_visible IS NULL OR length(numero_visible) <= 30),
  idioma               TEXT NOT NULL DEFAULT 'ca' CHECK (idioma IN ('ca', 'es')),
  actiu                INTEGER NOT NULL DEFAULT 0 CHECK (actiu IN (0, 1)),
  ofertes_automatiques INTEGER NOT NULL DEFAULT 1 CHECK (ofertes_automatiques IN (0, 1)),
  usuari_id            TEXT,
  actualitzat_el       TEXT NOT NULL
);

-- Un enviament és un lot de missatges: els d'una o diverses activitats o una comunicació general.
CREATE TABLE whatsapp_enviaments (
  id          TEXT PRIMARY KEY,
  casal_id    TEXT NOT NULL REFERENCES casals (id),
  cicle_id    TEXT NOT NULL,
  tipus       TEXT NOT NULL CHECK (tipus IN ('activitat', 'general', 'oferta')),
  -- Text de la comunicació general (el redacta el casal; no conté dades de les persones).
  text        TEXT CHECK (text IS NULL OR length(text) <= 900),
  abast       TEXT NOT NULL DEFAULT '{}',
  usuari_id   TEXT,
  creat_el    TEXT NOT NULL
);
CREATE INDEX idx_whatsapp_enviaments ON whatsapp_enviaments (casal_id, cicle_id, creat_el);

CREATE TABLE whatsapp_missatges (
  id              TEXT PRIMARY KEY,
  enviament_id    TEXT NOT NULL REFERENCES whatsapp_enviaments (id),
  casal_id        TEXT NOT NULL,
  cicle_id        TEXT NOT NULL,
  placa_id        TEXT NOT NULL REFERENCES places (id),
  plantilla       TEXT NOT NULL CHECK (plantilla IN ('placa_admesa', 'llista_espera', 'oferta_placa', 'avis_general')),
  estat           TEXT NOT NULL CHECK (estat IN ('pendent', 'enviat', 'entregat', 'llegit', 'fallit', 'no_enviable')),
  motiu           TEXT CHECK (motiu IS NULL OR motiu IN ('telefon_fix', 'sense_telefon', 'telefon_invalid', 'sense_whatsapp', 'error_meta')),
  -- Identificador del missatge a Meta (wamid), per lligar-hi els avisos d'entrega.
  wamid           TEXT UNIQUE,
  error_codi      INTEGER,
  error_text      TEXT CHECK (error_text IS NULL OR length(error_text) <= 200),
  resposta        TEXT CHECK (resposta IS NULL OR resposta IN ('si', 'no', 'text')),
  resposta_el     TEXT,
  creat_el        TEXT NOT NULL,
  actualitzat_el  TEXT NOT NULL
);
CREATE INDEX idx_whatsapp_missatges_enviament ON whatsapp_missatges (enviament_id, estat);
CREATE INDEX idx_whatsapp_missatges_placa ON whatsapp_missatges (placa_id, creat_el);
CREATE INDEX idx_whatsapp_missatges_cicle ON whatsapp_missatges (casal_id, cicle_id);
