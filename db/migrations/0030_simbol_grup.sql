-- Tipus d'activitat per no acumular-ne (petició de 2026-10-16): el grup passa a ser un símbol
-- (una lletra o un número, fins a 3 caràcters) en lloc d'un número de l'1 al 99.
ALTER TABLE activitats ADD COLUMN simbol_grup TEXT
  CHECK (simbol_grup IS NULL OR (length(simbol_grup) BETWEEN 1 AND 3 AND simbol_grup NOT GLOB '*[^A-Z0-9]*'));
UPDATE activitats SET simbol_grup = CAST(grup AS TEXT) WHERE grup IS NOT NULL;
