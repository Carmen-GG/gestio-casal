-- Comunicats de la superadministració (petició de 2026-10-16): un avís (tancament d'un casal,
-- incidència general…) per correu i WhatsApp a les persones responsables dels casals triats i
-- per WhatsApp a totes les persones usuàries d'aquests casals (les importades de la PGEc).
-- - No es desa cap telèfon ni correu dels destinataris: es llegeixen en el moment d'enviar.
-- - De cada destinatari només es desa l'estat i, si no s'ha pogut contactar, el motiu.

-- Mòbil de les persones de l'equip (la responsable el pot posar a «El meu compte»).
ALTER TABLE usuaris ADD COLUMN telefon TEXT CHECK (telefon IS NULL OR length(telefon) <= 30);

-- Número de WhatsApp Business de la superadministració (una sola fila). Serveix per escriure
-- a les responsables i a les persones dels casals que no tenen número propi actiu.
CREATE TABLE whatsapp_config_central (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  phone_number_id  TEXT NOT NULL CHECK (length(phone_number_id) BETWEEN 5 AND 40),
  numero_visible   TEXT CHECK (numero_visible IS NULL OR length(numero_visible) <= 30),
  idioma           TEXT NOT NULL DEFAULT 'ca' CHECK (idioma IN ('ca', 'es')),
  -- Com se signa el missatge: «Us escrivim del {remitent}».
  remitent         TEXT NOT NULL CHECK (length(remitent) BETWEEN 2 AND 120),
  actiu            INTEGER NOT NULL DEFAULT 0 CHECK (actiu IN (0, 1)),
  usuari_id        TEXT,
  actualitzat_el   TEXT NOT NULL
);

CREATE TABLE comunicats (
  id         TEXT PRIMARY KEY,
  assumpte   TEXT NOT NULL CHECK (length(assumpte) BETWEEN 3 AND 150),
  text       TEXT NOT NULL CHECK (length(text) BETWEEN 5 AND 900),
  casal_ids  TEXT NOT NULL,
  canals     TEXT NOT NULL,
  usuari_id  TEXT,
  creat_el   TEXT NOT NULL
);
CREATE INDEX idx_comunicats_data ON comunicats (creat_el);

CREATE TABLE comunicats_destinataris (
  id              TEXT PRIMARY KEY,
  comunicat_id    TEXT NOT NULL REFERENCES comunicats (id),
  casal_id        TEXT NOT NULL REFERENCES casals (id),
  tipus           TEXT NOT NULL CHECK (tipus IN ('responsable', 'persona')),
  -- usuaris.id (responsable) o persones_plataforma.id (persona usuària).
  referencia_id   TEXT NOT NULL,
  canal           TEXT NOT NULL CHECK (canal IN ('correu', 'whatsapp')),
  estat           TEXT NOT NULL CHECK (estat IN ('pendent', 'enviat', 'entregat', 'llegit', 'fallit', 'no_enviable')),
  motiu           TEXT CHECK (motiu IS NULL OR motiu IN (
                    'telefon_fix', 'sense_telefon', 'telefon_invalid', 'sense_whatsapp', 'error_meta',
                    'sense_numero', 'sense_correu', 'error_correu', 'duplicat')),
  wamid           TEXT UNIQUE,
  error_text      TEXT CHECK (error_text IS NULL OR length(error_text) <= 200),
  creat_el        TEXT NOT NULL,
  actualitzat_el  TEXT NOT NULL
);
CREATE INDEX idx_comunicats_destinataris ON comunicats_destinataris (comunicat_id, estat, tipus);
