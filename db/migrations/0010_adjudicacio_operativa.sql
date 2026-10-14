-- Migració 0010: suport operatiu de l'adjudicació (Fase 5).
-- Afegeix testimonis d'operació per condicionar historial i auditoria a l'escriptura
-- principal, i el bloqueig optimista de les places. No modifica dades existents.

ALTER TABLE execucions_adjudicacio ADD COLUMN darrera_operacio TEXT;

ALTER TABLE places ADD COLUMN versio INTEGER NOT NULL DEFAULT 1 CHECK (versio >= 1);
ALTER TABLE places ADD COLUMN darrera_operacio TEXT;

-- Execució que ha originat el moviment (confirmació o substitució), si escau.
ALTER TABLE moviments_places ADD COLUMN execucio_id TEXT REFERENCES execucions_adjudicacio(id);

CREATE INDEX idx_places_sollicitud ON places (sollicitud_id);
CREATE INDEX idx_moviments_placa ON moviments_places (placa_id, id);
CREATE INDEX idx_execucions_cicle ON execucions_adjudicacio (cicle_id, versio);
