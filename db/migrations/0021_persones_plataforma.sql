-- Persones usuàries de la plataforma de gestió d'equipaments (PGEc), importades dels
-- llistats d'usuaris i de carnets (petició de 2026-10-15) per poder-les cercar mentre
-- l'aplicació no s'hi connecti. Una fila per persona i casal; les importacions
-- successives completen la fila (mai no buiden un camp que ja tenia valor).
--   clau: «D:<document normalitzat>» o, sense document, «N:<nom i cognoms>|<data naixement>».
--   dades: JSON amb tots els camps importats (vegeu shared/domain/persones-plataforma.ts).
--   text_basic / text_contacte: text normalitzat per cercar a tots els camps, separat
--   per nivell de visibilitat perquè sense permís de contacte no es pugui cercar per telèfon.
CREATE TABLE persones_plataforma (
  id              TEXT PRIMARY KEY,
  casal_id        TEXT NOT NULL REFERENCES casals (id),
  clau            TEXT NOT NULL,
  document_norm   TEXT,
  nom             TEXT,
  cognom1         TEXT,
  cognom2         TEXT,
  clau_ordenacio  TEXT NOT NULL,
  data_naixement  TEXT,
  dades           TEXT NOT NULL,
  origens         TEXT NOT NULL,
  text_basic      TEXT NOT NULL,
  text_contacte   TEXT NOT NULL,
  creat_el        TEXT NOT NULL,
  actualitzat_el  TEXT NOT NULL,
  UNIQUE (casal_id, clau)
);
CREATE INDEX idx_persones_plataforma_ordre ON persones_plataforma (casal_id, clau_ordenacio);
CREATE INDEX idx_persones_plataforma_document ON persones_plataforma (casal_id, document_norm);
