-- Migració 0006: registre d'auditoria de les operacions rellevants.
-- Només d'addició. No ha de contenir dades personals completes: s'hi desen
-- identificadors interns i descripcions de l'operació, mai noms, telèfons ni DNI.

CREATE TABLE registres_auditoria (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  creat_el        TEXT NOT NULL,
  casal_id        TEXT REFERENCES casals(id),
  usuari_id       TEXT REFERENCES usuaris(id),
  tipus_operacio  TEXT NOT NULL,
  entitat         TEXT NOT NULL,
  entitat_id      TEXT,
  resultat        TEXT NOT NULL CHECK (resultat IN ('exit', 'error', 'denegat')),
  motiu           TEXT,
  detalls         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detalls)),
  id_peticio      TEXT
);

CREATE INDEX idx_auditoria_casal_data ON registres_auditoria (casal_id, creat_el);
CREATE INDEX idx_auditoria_entitat ON registres_auditoria (entitat, entitat_id);

CREATE TRIGGER trg_auditoria_no_update BEFORE UPDATE ON registres_auditoria
BEGIN SELECT RAISE(ABORT, 'auditoria_inalterable'); END;
CREATE TRIGGER trg_auditoria_no_delete BEFORE DELETE ON registres_auditoria
BEGIN SELECT RAISE(ABORT, 'auditoria_inalterable'); END;
