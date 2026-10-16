-- Qui gestiona l'activitat (petició de 2026-10-16): les estadístiques de la superadministració
-- només compten les activitats de la Generalitat. Les que el casal afegeix a mà són, per defecte,
-- d'associacions o entitats.
ALTER TABLE activitats ADD COLUMN gestio TEXT NOT NULL DEFAULT 'associacio' CHECK (gestio IN ('generalitat', 'associacio'));

-- Les activitats importades (fitxer o PGEc) són de la Generalitat.
UPDATE activitats SET gestio = 'generalitat'
WHERE importacio_id IS NOT NULL
   OR codi_extern IS NOT NULL
   OR EXISTS (SELECT 1 FROM historial_canvis h WHERE h.entitat = 'activitat' AND h.entitat_id = activitats.id AND h.accio = 'importacio');

CREATE INDEX idx_activitats_gestio ON activitats (cicle_id, gestio);
