-- Migració 0009: gestió de sol·licituds al panell, importacions i revisió de duplicats.

-- Bloqueig optimista i testimoni d'operació (com a cicles i activitats) per poder
-- editar dades i estats amb historial i auditoria condicionats a l'escriptura.
ALTER TABLE participants ADD COLUMN versio INTEGER NOT NULL DEFAULT 1;
ALTER TABLE participants ADD COLUMN darrera_operacio TEXT;
ALTER TABLE sollicituds ADD COLUMN versio INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sollicituds ADD COLUMN darrera_operacio TEXT;

-- Cada importació confirmada. Les files importades hi queden vinculades.
-- `clau` evita confirmar dues vegades la mateixa importació (doble clic o reintent).
CREATE TABLE importacions (
  id              TEXT PRIMARY KEY,
  casal_id        TEXT NOT NULL,
  cicle_id        TEXT NOT NULL,
  tipus           TEXT NOT NULL CHECK (tipus IN ('sollicituds', 'activitats')),
  clau            TEXT NOT NULL,
  nom_fitxer      TEXT,
  resum           TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(resum)),
  creat_per       TEXT REFERENCES usuaris(id),
  creat_el        TEXT NOT NULL,
  FOREIGN KEY (cicle_id, casal_id) REFERENCES cicles (id, casal_id),
  UNIQUE (cicle_id, clau)
);

CREATE TRIGGER trg_importacions_no_update BEFORE UPDATE ON importacions
BEGIN SELECT RAISE(ABORT, 'importacio_inalterable'); END;
CREATE TRIGGER trg_importacions_no_delete BEFORE DELETE ON importacions
BEGIN SELECT RAISE(ABORT, 'importacio_inalterable'); END;

ALTER TABLE sollicituds ADD COLUMN importacio_id TEXT REFERENCES importacions(id);
ALTER TABLE activitats ADD COLUMN importacio_id TEXT REFERENCES importacions(id);

-- Decisions de la revisió manual de possibles duplicats. Mai s'esborra res
-- automàticament: aquí només es recorda que una parella ja s'ha revisat.
CREATE TABLE revisions_duplicats (
  id               TEXT PRIMARY KEY,
  casal_id         TEXT NOT NULL REFERENCES casals(id),
  cicle_id         TEXT NOT NULL,
  -- Parella ordenada (sollicitud_a < sollicitud_b) perquè sigui única.
  sollicitud_a     TEXT NOT NULL REFERENCES sollicituds(id),
  sollicitud_b     TEXT NOT NULL REFERENCES sollicituds(id),
  decisio          TEXT NOT NULL CHECK (decisio IN ('no_duplicat', 'duplicat')),
  motiu            TEXT,
  revisat_per      TEXT REFERENCES usuaris(id),
  revisat_el       TEXT NOT NULL,
  CHECK (sollicitud_a < sollicitud_b),
  UNIQUE (sollicitud_a, sollicitud_b)
);

CREATE INDEX idx_participants_email ON participants (casal_id, email) WHERE email IS NOT NULL;
CREATE INDEX idx_participants_telefon ON participants (casal_id, telefon) WHERE telefon IS NOT NULL;
CREATE INDEX idx_participants_document ON participants (casal_id, document_identitat) WHERE document_identitat IS NOT NULL;
