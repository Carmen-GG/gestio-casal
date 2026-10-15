-- Baixes voluntàries (decisió de 2026-10-15): quan una persona deixa una activitat
-- es desa el motiu i la data per als indicadors. La plaça passa a «Renúncia» i
-- s'ofereix a la persona següent de la llista d'espera.
CREATE TABLE baixes_voluntaries (
  placa_id        TEXT PRIMARY KEY REFERENCES places (id),
  casal_id        TEXT NOT NULL,
  cicle_id        TEXT NOT NULL,
  activitat_id    TEXT NOT NULL,
  estat_anterior  TEXT NOT NULL CHECK (estat_anterior IN ('admesa', 'oferta_pendent')),
  data            TEXT NOT NULL CHECK (data GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  motiu           TEXT NOT NULL CHECK (length(trim(motiu)) >= 3),
  usuari_id       TEXT,
  creat_el        TEXT NOT NULL
);
CREATE INDEX idx_baixes_voluntaries_cicle ON baixes_voluntaries (casal_id, cicle_id);
