-- Migració 0024: publicació a Instagram dels materials de PG-Cartells (petició de 2026-10-16).
-- - Cada casal connecta el seu compte professional d'Instagram (API d'Instagram de Meta).
--   El testimoni d'accés es desa xifrat (AES-GCM amb el secret INSTAGRAM_CLAU del Worker).
-- - L'aplicació no publica mai automàticament: una persona revisa la imatge i el text i
--   confirma la publicació. Si el compte no està connectat, es descarrega i es publica a mà.
-- Només afegeix taules i permisos. No modifica dades existents.

INSERT INTO permisos (codi, modul, descripcio) VALUES
  ('instagram.publicar', 'cartells', 'Preparar i publicar a Instagram els materials del casal');

INSERT INTO rols_permisos (rol_codi, permis_codi) VALUES
  ('responsable_casal', 'instagram.publicar'),
  ('difusio_casal', 'instagram.publicar'),
  ('admin_central', 'instagram.publicar');

-- Compte d'Instagram connectat a cada casal (un per casal).
CREATE TABLE instagram_comptes (
  casal_id         TEXT PRIMARY KEY REFERENCES casals(id),
  ig_usuari_id     TEXT NOT NULL CHECK (length(ig_usuari_id) BETWEEN 1 AND 64),
  nom_usuari       TEXT NOT NULL CHECK (length(nom_usuari) BETWEEN 1 AND 64),
  -- Testimoni xifrat: base64url(iv) + '.' + base64url(xifrat). Mai es retorna per l'API.
  testimoni_xifrat TEXT NOT NULL,
  testimoni_caduca_el TEXT,
  testimoni_renovat_el TEXT NOT NULL,
  connectat_per    TEXT NOT NULL REFERENCES usuaris(id),
  connectat_el     TEXT NOT NULL
);

-- Publicacions preparades a partir d'un material (imatge JPEG desada a cartells_fitxers).
CREATE TABLE instagram_publicacions (
  id               TEXT PRIMARY KEY,
  casal_id         TEXT NOT NULL REFERENCES casals(id),
  fitxer_id        TEXT NOT NULL,
  fitxer_us        TEXT NOT NULL DEFAULT 'material' CHECK (fitxer_us = 'material'),
  titol            TEXT NOT NULL CHECK (length(trim(titol)) BETWEEN 1 AND 120),
  peu              TEXT NOT NULL CHECK (length(peu) <= 2200),
  estat            TEXT NOT NULL DEFAULT 'esborrany'
                   CHECK (estat IN ('esborrany', 'publicant', 'publicada', 'error', 'publicada_manualment', 'descartada')),
  ig_media_id      TEXT,
  enllac           TEXT,
  error_missatge   TEXT CHECK (error_missatge IS NULL OR length(error_missatge) <= 500),
  -- Adreça temporal perquè Instagram descarregui la imatge mentre es publica (només el resum).
  imatge_testimoni_resum TEXT,
  imatge_caduca_el TEXT,
  versio           INTEGER NOT NULL DEFAULT 1 CHECK (versio >= 1),
  creat_per        TEXT NOT NULL REFERENCES usuaris(id),
  creat_el         TEXT NOT NULL,
  publicat_per     TEXT REFERENCES usuaris(id),
  publicat_el      TEXT,
  actualitzat_el   TEXT NOT NULL,
  FOREIGN KEY (fitxer_id, fitxer_us) REFERENCES cartells_fitxers (id, us)
);
CREATE INDEX idx_instagram_publicacions_casal ON instagram_publicacions (casal_id, creat_el);
CREATE UNIQUE INDEX idx_instagram_publicacions_imatge ON instagram_publicacions (imatge_testimoni_resum)
  WHERE imatge_testimoni_resum IS NOT NULL;
CREATE TRIGGER trg_instagram_publicacions_no_delete BEFORE DELETE ON instagram_publicacions
BEGIN SELECT RAISE(ABORT, 'publicacio_no_esborrable'); END;
