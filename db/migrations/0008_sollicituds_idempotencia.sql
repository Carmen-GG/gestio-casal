-- Migració 0008: dades addicionals de les sol·licituds rebudes pel formulari públic.

-- Resum (SHA-256) del contingut normalitzat de la petició original. Si arriba un
-- reintent amb la mateixa clau d'idempotència i el mateix contingut, es retorna
-- la mateixa confirmació; si el contingut és diferent, es rebutja.
ALTER TABLE sollicituds ADD COLUMN resum_peticio TEXT;

-- Constància de la informació de protecció de dades que la persona ha acceptat:
-- quan i un resum (SHA-256) del text exacte que se li ha mostrat.
ALTER TABLE sollicituds ADD COLUMN privacitat_acceptada_el TEXT;
ALTER TABLE sollicituds ADD COLUMN privacitat_resum TEXT;

CREATE TRIGGER trg_sollicituds_constancia_immutable
BEFORE UPDATE OF resum_peticio, privacitat_acceptada_el, privacitat_resum ON sollicituds
BEGIN SELECT RAISE(ABORT, 'camp_immutable'); END;
