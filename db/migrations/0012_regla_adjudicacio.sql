-- Migració 0012: regla d'adjudicació del casal (prioritat per la llista d'espera
-- anterior i sorteig per activitat), números de sorteig i mínim de participants.
-- Només afegeix columnes i taules. No modifica dades existents.

-- Resultat obtingut amb la prioritat de la llista d'espera del cicle anterior.
ALTER TABLE resultats_adjudicacio ADD COLUMN per_espera_anterior INTEGER NOT NULL DEFAULT 0
  CHECK (per_espera_anterior IN (0, 1));

-- Mínim de participants perquè l'activitat es faci. Només genera avisos.
ALTER TABLE activitats ADD COLUMN minim_participants INTEGER CHECK (minim_participants IS NULL OR minim_participants >= 0);

-- Número aleatori de cada sol·licitud per al sorteig de número (numeració «aleatòria»).
-- S'assigna una sola vegada i no es pot modificar ni esborrar.
CREATE TABLE numeros_sorteig (
  cicle_id       TEXT NOT NULL,
  sollicitud_id  TEXT NOT NULL,
  numero         INTEGER NOT NULL CHECK (numero >= 1),
  assignat_per   TEXT REFERENCES usuaris(id),
  assignat_el    TEXT NOT NULL,
  PRIMARY KEY (cicle_id, sollicitud_id),
  UNIQUE (cicle_id, numero),
  FOREIGN KEY (sollicitud_id, cicle_id) REFERENCES sollicituds (id, cicle_id)
);
CREATE TRIGGER trg_numeros_sorteig_no_update BEFORE UPDATE ON numeros_sorteig
BEGIN SELECT RAISE(ABORT, 'numero_sorteig_immutable'); END;
CREATE TRIGGER trg_numeros_sorteig_no_delete BEFORE DELETE ON numeros_sorteig
BEGIN SELECT RAISE(ABORT, 'numero_sorteig_immutable'); END;

-- Sortejos per activitat. Un sorteig no s'esborra: si cal repetir-lo, s'anul·la amb motiu.
CREATE TABLE sortejos_adjudicacio (
  id               TEXT PRIMARY KEY,
  casal_id         TEXT NOT NULL,
  cicle_id         TEXT NOT NULL,
  activitat_id     TEXT NOT NULL,
  tipus            TEXT NOT NULL CHECK (tipus IN ('numero', 'lletra')),
  valor            TEXT NOT NULL,
  -- Rang del sorteig de número (1..rang_maxim) en el moment de fer-lo.
  rang_maxim       INTEGER CHECK (rang_maxim IS NULL OR rang_maxim >= 1),
  numeracio        TEXT CHECK (numeracio IS NULL OR numeracio IN ('inscripcio', 'aleatoria')),
  origen           TEXT NOT NULL CHECK (origen IN ('aplicacio', 'manual')),
  motiu            TEXT,
  estat            TEXT NOT NULL DEFAULT 'vigent' CHECK (estat IN ('vigent', 'anullat')),
  realitzat_per    TEXT REFERENCES usuaris(id),
  realitzat_el     TEXT NOT NULL,
  anullat_per      TEXT REFERENCES usuaris(id),
  anullat_el       TEXT,
  motiu_anullacio  TEXT,
  darrera_operacio TEXT,
  FOREIGN KEY (cicle_id, casal_id) REFERENCES cicles (id, casal_id),
  FOREIGN KEY (activitat_id, cicle_id) REFERENCES activitats (id, cicle_id),
  CHECK ((estat = 'anullat') = (anullat_el IS NOT NULL))
);
CREATE UNIQUE INDEX uq_sorteig_vigent ON sortejos_adjudicacio (activitat_id) WHERE estat = 'vigent';
CREATE INDEX idx_sortejos_cicle ON sortejos_adjudicacio (cicle_id, realitzat_el);
CREATE TRIGGER trg_sortejos_no_delete BEFORE DELETE ON sortejos_adjudicacio
BEGIN SELECT RAISE(ABORT, 'sorteig_no_esborrable'); END;
-- Només es pot anul·lar: cap altre camp canvia.
CREATE TRIGGER trg_sortejos_nomes_anullar
BEFORE UPDATE OF id, casal_id, cicle_id, activitat_id, tipus, valor, rang_maxim, numeracio, origen, motiu, realitzat_per, realitzat_el
ON sortejos_adjudicacio
BEGIN SELECT RAISE(ABORT, 'sorteig_inalterable'); END;
