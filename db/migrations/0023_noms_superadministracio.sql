-- La persona creada amb el nom provisional «Administració central» passa a dir-se «Superadministració»
-- (petició de 2026-10-15: aquest nom no ha de sortir enlloc). No toca cap altra persona.
UPDATE usuaris SET nom_visible = 'Superadministració' WHERE nom_visible = 'Administració central';
