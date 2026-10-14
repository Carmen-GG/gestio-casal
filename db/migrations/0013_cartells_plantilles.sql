-- Migració 0013: mòdul PG-Cartells, fitxers i plantilles.
-- Els fitxers es desen a Cloudflare R2; aquí només hi ha les metadades i la referència.
-- Només afegeix taules. No modifica dades existents.

-- Fitxers del mòdul (plantilles, imatges de previsualització, fotografies, logotips i materials generats).
-- casal_id NULL = recurs institucional comú a tots els casals.
-- Un fitxer no s'esborra ni se substitueix: un canvi és un fitxer nou.
CREATE TABLE cartells_fitxers (
  id            TEXT PRIMARY KEY,
  casal_id      TEXT REFERENCES casals(id),
  us            TEXT NOT NULL CHECK (us IN ('plantilla', 'previsualitzacio', 'fotografia', 'logotip', 'material')),
  clau          TEXT NOT NULL UNIQUE,
  tipus_mime    TEXT NOT NULL CHECK (tipus_mime IN ('application/pdf', 'image/jpeg', 'image/png')),
  mida          INTEGER NOT NULL CHECK (mida > 0),
  sha256        TEXT NOT NULL CHECK (length(sha256) = 64),
  nom_original  TEXT NOT NULL CHECK (length(trim(nom_original)) > 0),
  pujat_per     TEXT NOT NULL REFERENCES usuaris(id),
  pujat_el      TEXT NOT NULL,
  UNIQUE (id, us)
);
CREATE INDEX idx_cartells_fitxers_casal ON cartells_fitxers (casal_id, us);
CREATE INDEX idx_cartells_fitxers_sha ON cartells_fitxers (sha256);
CREATE TRIGGER trg_cartells_fitxers_no_update BEFORE UPDATE ON cartells_fitxers
BEGIN SELECT RAISE(ABORT, 'fitxer_immutable'); END;
CREATE TRIGGER trg_cartells_fitxers_no_delete BEFORE DELETE ON cartells_fitxers
BEGIN SELECT RAISE(ABORT, 'fitxer_immutable'); END;

-- Plantilles de cartell i d'Instagram. El PDF original es conserva tal com es va carregar;
-- «camps» desa els camps del formulari i el rol que s'ha assignat a cadascun.
CREATE TABLE cartells_plantilles (
  id                 TEXT PRIMARY KEY,
  casal_id           TEXT REFERENCES casals(id),
  fitxer_id          TEXT NOT NULL,
  fitxer_us          TEXT NOT NULL DEFAULT 'plantilla' CHECK (fitxer_us = 'plantilla'),
  -- Imatge petita del disseny base (sense els continguts d'exemple), per a la biblioteca.
  previsualitzacio_id TEXT,
  previsualitzacio_us TEXT NOT NULL DEFAULT 'previsualitzacio' CHECK (previsualitzacio_us = 'previsualitzacio'),
  nom                TEXT NOT NULL CHECK (length(trim(nom)) > 0),
  tipus              TEXT NOT NULL CHECK (tipus IN ('cartell', 'instagram')),
  estacio            TEXT CHECK (estacio IS NULL OR estacio IN ('primavera', 'estiu', 'tardor', 'hivern')),
  linies_titol       INTEGER NOT NULL CHECK (linies_titol BETWEEN 1 AND 3),
  amb_qr             INTEGER NOT NULL DEFAULT 0 CHECK (amb_qr IN (0, 1)),
  tematica           TEXT,
  identitat_grafica  TEXT,
  estat              TEXT NOT NULL DEFAULT 'esborrany' CHECK (estat IN ('esborrany', 'activa', 'arxivada')),
  pagina_amplada     REAL NOT NULL CHECK (pagina_amplada > 0),
  pagina_alcada      REAL NOT NULL CHECK (pagina_alcada > 0),
  format_sortida     TEXT NOT NULL CHECK (format_sortida IN ('A4', 'A3', '1080x1080')),
  camps              TEXT NOT NULL CHECK (json_valid(camps) AND json_type(camps) = 'array'),
  versio             INTEGER NOT NULL DEFAULT 1 CHECK (versio >= 1),
  darrera_operacio   TEXT,
  creat_per          TEXT NOT NULL REFERENCES usuaris(id),
  creat_el           TEXT NOT NULL,
  actualitzat_el     TEXT NOT NULL,
  UNIQUE (fitxer_id),
  FOREIGN KEY (fitxer_id, fitxer_us) REFERENCES cartells_fitxers (id, us),
  FOREIGN KEY (previsualitzacio_id, previsualitzacio_us) REFERENCES cartells_fitxers (id, us)
);
CREATE INDEX idx_cartells_plantilles_casal ON cartells_plantilles (casal_id, tipus, estat);
CREATE TRIGGER trg_cartells_plantilles_no_delete BEFORE DELETE ON cartells_plantilles
BEGIN SELECT RAISE(ABORT, 'plantilla_no_esborrable'); END;
