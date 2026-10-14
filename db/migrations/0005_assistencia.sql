-- Migració 0005: sessions de les activitats i registres d'assistència.

CREATE TABLE sessions_activitat (
  id            TEXT PRIMARY KEY,
  activitat_id  TEXT NOT NULL REFERENCES activitats(id),
  data          TEXT NOT NULL,
  hora_inici    TEXT,
  hora_fi       TEXT,
  estat         TEXT NOT NULL DEFAULT 'prevista' CHECK (estat IN ('prevista', 'realitzada', 'cancellada')),
  creat_el      TEXT NOT NULL,
  actualitzat_el TEXT NOT NULL,
  UNIQUE (activitat_id, data, hora_inici)
);

CREATE INDEX idx_sessions_activitat_data ON sessions_activitat (activitat_id, data);

-- Una marca per plaça i sessió. Les modificacions queden a historial_canvis.
CREATE TABLE registres_assistencia (
  sessio_id      TEXT NOT NULL REFERENCES sessions_activitat(id),
  placa_id       TEXT NOT NULL REFERENCES places(id),
  estat          TEXT NOT NULL CHECK (estat IN ('present', 'absent', 'absencia_justificada')),
  registrat_per  TEXT REFERENCES usuaris(id),
  registrat_el   TEXT NOT NULL,
  PRIMARY KEY (sessio_id, placa_id)
);
