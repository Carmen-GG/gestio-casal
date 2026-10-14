-- Migració 0003: participants, sol·licituds d'inscripció i preferències.

-- Dades personals d'una persona participant, desades una sola vegada per casal.
-- Tots els camps excepte nom i primer cognom són opcionals: el cicle decideix
-- quins es recullen (principi de minimització).
CREATE TABLE participants (
  id                       TEXT PRIMARY KEY,
  casal_id                 TEXT NOT NULL REFERENCES casals(id),
  nom                      TEXT NOT NULL,
  cognom1                  TEXT NOT NULL,
  cognom2                  TEXT,
  -- Clau d'ordenació normalitzada (cognom1, cognom2, nom sense accents i en minúscules),
  -- calculada al servidor per ordenar correctament en català i castellà.
  clau_ordenacio           TEXT NOT NULL,
  data_naixement           TEXT,
  document_identitat       TEXT,       -- només si està justificat i autoritzat; mai com a identificador visible
  telefon                  TEXT,
  email                    TEXT,
  adreca                   TEXT,
  codi_postal              TEXT,
  municipi                 TEXT,
  lloc_naixement           TEXT,
  barri                    TEXT,
  codi_participant_intern  TEXT,       -- identificador intern del casal, si existeix
  creat_el                 TEXT NOT NULL,
  actualitzat_el           TEXT NOT NULL,
  UNIQUE (id, casal_id)
);

CREATE INDEX idx_participants_casal_ordenacio ON participants (casal_id, clau_ordenacio);
CREATE UNIQUE INDEX uq_participants_codi_intern ON participants (casal_id, codi_participant_intern)
  WHERE codi_participant_intern IS NOT NULL;

CREATE TABLE sollicituds (
  id                 TEXT PRIMARY KEY,
  casal_id           TEXT NOT NULL,
  cicle_id           TEXT NOT NULL,
  participant_id     TEXT NOT NULL,
  -- Número correlatiu dins del cicle, visible per a la gestió. Immutable.
  numero             INTEGER NOT NULL CHECK (numero >= 1),
  -- Data i hora de recepció al servidor. Determina l'ordre d'inscripció. Immutable.
  rebuda_el          TEXT NOT NULL,
  estat              TEXT NOT NULL DEFAULT 'rebuda'
                     CHECK (estat IN ('rebuda', 'validada', 'pendent_revisio', 'anullada')),
  origen             TEXT NOT NULL CHECK (origen IN ('formulari_public', 'importacio', 'gestio')),
  clau_idempotencia  TEXT,
  -- Codi de confirmació aleatori que es mostra a la persona sol·licitant.
  codi_confirmacio   TEXT NOT NULL UNIQUE,
  actualitzat_el     TEXT NOT NULL,
  FOREIGN KEY (cicle_id, casal_id) REFERENCES cicles (id, casal_id),
  FOREIGN KEY (participant_id, casal_id) REFERENCES participants (id, casal_id),
  UNIQUE (id, cicle_id),
  UNIQUE (cicle_id, numero)
);

CREATE INDEX idx_sollicituds_cicle_rebuda ON sollicituds (cicle_id, rebuda_el, numero);
CREATE INDEX idx_sollicituds_participant ON sollicituds (participant_id);
-- Protecció contra enviaments duplicats (doble clic o reintent): la mateixa clau
-- d'idempotència dins d'un cicle només pot crear una sol·licitud.
CREATE UNIQUE INDEX uq_sollicituds_idempotencia ON sollicituds (cicle_id, clau_idempotencia)
  WHERE clau_idempotencia IS NOT NULL;

CREATE TRIGGER trg_sollicituds_immutables
BEFORE UPDATE OF numero, rebuda_el, cicle_id, casal_id, codi_confirmacio ON sollicituds
BEGIN SELECT RAISE(ABORT, 'camp_immutable'); END;

CREATE TRIGGER trg_sollicituds_no_delete BEFORE DELETE ON sollicituds
BEGIN SELECT RAISE(ABORT, 'sollicitud_no_esborrable'); END;

-- Preferències d'una sol·licitud. L'activitat ha de pertànyer al mateix cicle
-- (claus foranes compostes) i cada número de preferència és únic dins la sol·licitud.
CREATE TABLE preferencies (
  sollicitud_id  TEXT NOT NULL,
  cicle_id       TEXT NOT NULL,
  activitat_id   TEXT NOT NULL,
  ordre          INTEGER NOT NULL CHECK (ordre >= 1),
  PRIMARY KEY (sollicitud_id, activitat_id),
  UNIQUE (sollicitud_id, ordre),
  FOREIGN KEY (sollicitud_id, cicle_id) REFERENCES sollicituds (id, cicle_id),
  FOREIGN KEY (activitat_id, cicle_id) REFERENCES activitats (id, cicle_id)
);

CREATE INDEX idx_preferencies_activitat ON preferencies (activitat_id, ordre);
