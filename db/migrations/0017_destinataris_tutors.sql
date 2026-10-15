-- Persones a qui va dirigida l'activitat (columna del llistat de la PGEc). Decisió de 2026-10-15.
ALTER TABLE activitats ADD COLUMN destinataris TEXT;

-- Autorització del pare, mare o tutor legal quan la persona participant és menor
-- d'edat en el moment d'enviar la sol·licitud. La signatura és la imatge PNG
-- dibuixada al formulari (data URL); no conté cap altra dada.
CREATE TABLE autoritzacions_tutor (
  sollicitud_id       TEXT PRIMARY KEY REFERENCES sollicituds (id),
  casal_id            TEXT NOT NULL,
  nom                 TEXT NOT NULL CHECK (length(trim(nom)) > 0),
  cognoms             TEXT NOT NULL CHECK (length(trim(cognoms)) > 0),
  document_identitat  TEXT NOT NULL,
  autoritza           INTEGER NOT NULL CHECK (autoritza = 1),
  signatura           TEXT NOT NULL CHECK (signatura LIKE 'data:image/png;base64,%' AND length(signatura) <= 300000),
  creat_el            TEXT NOT NULL
);
