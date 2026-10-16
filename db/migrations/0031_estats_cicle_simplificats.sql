-- Migració 0031: simplificació dels estats del cicle (petició de 2026-10-16).
-- De nou estats en queden cinc: Preparació, Inscripcions obertes, Adjudicació, Adjudicat i Arxivat.
-- - Esborrany i Preparació eren equivalents: tot passa a «preparacio».
-- - Inscripcions tancades i En procés d'adjudicació s'uneixen a «adjudicacio_en_proces».
-- - Publicat no permetia res que Adjudicat no permetés: passa a «adjudicat».
-- - Finalitzat només podia anar a Arxivat: passa a «arxivat».
-- La restricció CHECK de la taula continua acceptant els valors antics (reconstruir la taula
-- amb tantes claus foranes no val la pena); l'aplicació ja no els fa servir.

UPDATE cicles SET estat = 'preparacio' WHERE estat = 'esborrany';
UPDATE cicles SET estat = 'adjudicacio_en_proces' WHERE estat = 'inscripcions_tancades';
UPDATE cicles SET estat = 'adjudicat' WHERE estat = 'publicat';
UPDATE cicles SET estat = 'arxivat' WHERE estat = 'finalitzat';
