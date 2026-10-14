-- Migració 0004: configuració, execució i resultats de l'adjudicació; places i llistes d'espera.

-- Paràmetres d'adjudicació d'un cicle, versionats. Cada canvi crea una versió nova.
-- Les regles oficials s'han de validar abans d'utilitzar-les en una adjudicació real.
CREATE TABLE configuracions_adjudicacio (
  id          TEXT PRIMARY KEY,
  cicle_id    TEXT NOT NULL REFERENCES cicles(id),
  versio      INTEGER NOT NULL CHECK (versio >= 1),
  parametres  TEXT NOT NULL CHECK (json_valid(parametres)),
  creat_per   TEXT REFERENCES usuaris(id),
  creat_el    TEXT NOT NULL,
  UNIQUE (cicle_id, versio)
);

CREATE TRIGGER trg_config_adjudicacio_no_update BEFORE UPDATE ON configuracions_adjudicacio
BEGIN SELECT RAISE(ABORT, 'configuracio_versionada_inalterable'); END;

-- Cada execució del motor d'adjudicació. Mai s'esborra: una proposta es descarta
-- i una adjudicació confirmada només es pot substituir per una nova versió amb motiu.
CREATE TABLE execucions_adjudicacio (
  id                 TEXT PRIMARY KEY,
  casal_id           TEXT NOT NULL,
  cicle_id           TEXT NOT NULL,
  configuracio_id    TEXT NOT NULL REFERENCES configuracions_adjudicacio(id),
  versio             INTEGER NOT NULL CHECK (versio >= 1),
  estat              TEXT NOT NULL DEFAULT 'proposta'
                     CHECK (estat IN ('proposta', 'confirmada', 'substituida', 'descartada')),
  -- Paràmetres de desempat registrats per poder reproduir el resultat.
  lletra_sorteig     TEXT,
  llavor_desempat    TEXT,
  motiu              TEXT,      -- obligatori quan es recalcula una adjudicació confirmada
  resum              TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(resum)),
  executada_per      TEXT REFERENCES usuaris(id),
  executada_el       TEXT NOT NULL,
  confirmada_per     TEXT REFERENCES usuaris(id),
  confirmada_el      TEXT,
  substituida_per_execucio TEXT REFERENCES execucions_adjudicacio(id),
  FOREIGN KEY (cicle_id, casal_id) REFERENCES cicles (id, casal_id),
  UNIQUE (cicle_id, versio)
);

-- Només hi pot haver una adjudicació confirmada vigent per cicle.
CREATE UNIQUE INDEX uq_execucio_confirmada ON execucions_adjudicacio (cicle_id)
  WHERE estat = 'confirmada';

-- Resultat de cada parella sol·licitud-activitat en una execució.
CREATE TABLE resultats_adjudicacio (
  execucio_id        TEXT NOT NULL REFERENCES execucions_adjudicacio(id),
  sollicitud_id      TEXT NOT NULL REFERENCES sollicituds(id),
  activitat_id       TEXT NOT NULL REFERENCES activitats(id),
  preferencia        INTEGER NOT NULL CHECK (preferencia >= 1),
  resultat           TEXT NOT NULL CHECK (resultat IN ('admesa', 'llista_espera', 'no_adjudicada')),
  posicio_espera     INTEGER CHECK (posicio_espera IS NULL OR posicio_espera >= 1),
  ordre_adjudicacio  INTEGER NOT NULL CHECK (ordre_adjudicacio >= 1),
  per_continuitat    INTEGER NOT NULL DEFAULT 0 CHECK (per_continuitat IN (0, 1)),
  motiu              TEXT,
  PRIMARY KEY (execucio_id, sollicitud_id, activitat_id),
  CHECK ((resultat = 'llista_espera') = (posicio_espera IS NOT NULL))
);

CREATE INDEX idx_resultats_activitat ON resultats_adjudicacio (execucio_id, activitat_id, resultat);

-- Els resultats d'una execució que ja no és proposta són inalterables.
CREATE TRIGGER trg_resultats_no_update BEFORE UPDATE ON resultats_adjudicacio
BEGIN SELECT RAISE(ABORT, 'resultats_inalterables'); END;
CREATE TRIGGER trg_resultats_no_delete BEFORE DELETE ON resultats_adjudicacio
WHEN (SELECT estat FROM execucions_adjudicacio WHERE id = OLD.execucio_id) <> 'proposta'
BEGIN SELECT RAISE(ABORT, 'resultats_inalterables'); END;

CREATE TRIGGER trg_execucions_no_delete BEFORE DELETE ON execucions_adjudicacio
BEGIN SELECT RAISE(ABORT, 'execucio_no_esborrable'); END;

-- Estat operatiu de les places després de confirmar una adjudicació
-- (ofertes de vacants, renúncies, baixes...). Cada canvi queda a moviments_places.
CREATE TABLE places (
  id                    TEXT PRIMARY KEY,
  casal_id              TEXT NOT NULL REFERENCES casals(id),
  activitat_id          TEXT NOT NULL REFERENCES activitats(id),
  sollicitud_id         TEXT NOT NULL REFERENCES sollicituds(id),
  estat                 TEXT NOT NULL
                        CHECK (estat IN ('admesa', 'llista_espera', 'oferta_pendent', 'renuncia', 'baixa')),
  posicio_espera        INTEGER CHECK (posicio_espera IS NULL OR posicio_espera >= 1),
  preferencia           INTEGER NOT NULL,
  execucio_origen_id    TEXT NOT NULL REFERENCES execucions_adjudicacio(id),
  actualitzat_el        TEXT NOT NULL,
  FOREIGN KEY (activitat_id, casal_id) REFERENCES activitats (id, casal_id),
  UNIQUE (activitat_id, sollicitud_id)
);

CREATE INDEX idx_places_activitat_estat ON places (activitat_id, estat, posicio_espera);

CREATE TABLE moviments_places (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  placa_id        TEXT NOT NULL REFERENCES places(id),
  estat_anterior  TEXT,
  estat_nou       TEXT NOT NULL,
  motiu           TEXT,
  usuari_id       TEXT REFERENCES usuaris(id),
  creat_el        TEXT NOT NULL
);

CREATE TRIGGER trg_moviments_no_update BEFORE UPDATE ON moviments_places
BEGIN SELECT RAISE(ABORT, 'moviments_inalterables'); END;
CREATE TRIGGER trg_moviments_no_delete BEFORE DELETE ON moviments_places
BEGIN SELECT RAISE(ABORT, 'moviments_inalterables'); END;
