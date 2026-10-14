-- Migració 0011: suport operatiu del control d'assistència (Fase 6).
-- Afegeix testimonis d'operació i versions per al bloqueig optimista, el motiu
-- de cancel·lació d'una sessió i el llindar d'assistència del cicle.
-- No modifica dades existents.

ALTER TABLE sessions_activitat ADD COLUMN versio INTEGER NOT NULL DEFAULT 1 CHECK (versio >= 1);
ALTER TABLE sessions_activitat ADD COLUMN darrera_operacio TEXT;
ALTER TABLE sessions_activitat ADD COLUMN motiu_cancellacio TEXT;
ALTER TABLE sessions_activitat ADD COLUMN creat_per TEXT REFERENCES usuaris(id);

ALTER TABLE registres_assistencia ADD COLUMN versio INTEGER NOT NULL DEFAULT 1 CHECK (versio >= 1);
ALTER TABLE registres_assistencia ADD COLUMN darrera_operacio TEXT;

-- Percentatge mínim d'assistència (1-100) per identificar persones per sota.
-- NULL: no s'ha configurat cap llindar. No comporta cap acció automàtica.
ALTER TABLE cicles ADD COLUMN llindar_assistencia INTEGER CHECK (llindar_assistencia IS NULL OR llindar_assistencia BETWEEN 1 AND 100);

CREATE INDEX idx_assistencia_placa ON registres_assistencia (placa_id);
