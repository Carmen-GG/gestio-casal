-- Comunicació de l'assignació per WhatsApp (decisió de 2026-10-15): un missatge per
-- activitat i persona (admesa o en llista d'espera). Es desa què s'ha comunicat, per
-- quin canal i si la persona no s'ha pogut contactar, per fer el llistat de trucades.
-- El text del missatge no es desa: es genera a partir de les dades de la plaça.
CREATE TABLE comunicacions_placa (
  placa_id        TEXT PRIMARY KEY REFERENCES places (id),
  casal_id        TEXT NOT NULL,
  cicle_id        TEXT NOT NULL,
  tipus           TEXT NOT NULL CHECK (tipus IN ('admesa', 'espera')),
  canal           TEXT NOT NULL CHECK (canal IN ('whatsapp_manual', 'whatsapp_api', 'telefon')),
  estat           TEXT NOT NULL CHECK (estat IN ('enviat', 'no_contactat', 'contactat_telefon')),
  motiu           TEXT CHECK (motiu IS NULL OR motiu IN ('telefon_fix', 'sense_telefon', 'telefon_invalid', 'sense_whatsapp', 'no_respon', 'altres')),
  nota            TEXT CHECK (nota IS NULL OR length(nota) <= 300),
  usuari_id       TEXT,
  actualitzat_el  TEXT NOT NULL
);
CREATE INDEX idx_comunicacions_cicle ON comunicacions_placa (casal_id, cicle_id);
