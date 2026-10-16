-- Migració 0033: fototeca de PG-Cartells (petició de 2026-10-16).
-- Cada casal (i la superadministració, per a totes) pot pujar carpetes senceres de fotos i
-- triar-ne després una per a cada material. Les fotos es desen a R2 com a fitxers «fotografia»
-- (ja reduïdes al navegador) amb una miniatura «previsualitzacio» per a la galeria.
-- Els fitxers són immutables: retirar una foto de la fototeca només n'amaga la fila.
-- casal_id NULL = foto comuna a tots els casals.

CREATE TABLE cartells_fotos (
  id            TEXT PRIMARY KEY,
  casal_id      TEXT REFERENCES casals (id),
  fitxer_id     TEXT NOT NULL,
  fitxer_us     TEXT NOT NULL DEFAULT 'fotografia' CHECK (fitxer_us = 'fotografia'),
  miniatura_id  TEXT NOT NULL,
  miniatura_us  TEXT NOT NULL DEFAULT 'previsualitzacio' CHECK (miniatura_us = 'previsualitzacio'),
  -- Camí de la carpeta dins de la carpeta pujada («Tardor 2026/Ioga»); buit si no n'hi ha.
  carpeta       TEXT NOT NULL DEFAULT '' CHECK (length(carpeta) <= 300),
  nom           TEXT NOT NULL CHECK (length(trim(nom)) BETWEEN 1 AND 200),
  amplada       INTEGER CHECK (amplada IS NULL OR amplada > 0),
  alcada        INTEGER CHECK (alcada IS NULL OR alcada > 0),
  pujada_per    TEXT NOT NULL REFERENCES usuaris (id),
  pujada_el     TEXT NOT NULL,
  retirada_per  TEXT REFERENCES usuaris (id),
  retirada_el   TEXT,
  FOREIGN KEY (fitxer_id, fitxer_us) REFERENCES cartells_fitxers (id, us),
  FOREIGN KEY (miniatura_id, miniatura_us) REFERENCES cartells_fitxers (id, us)
);
CREATE INDEX idx_cartells_fotos_casal ON cartells_fotos (casal_id, retirada_el, carpeta);
CREATE INDEX idx_cartells_fotos_fitxer ON cartells_fotos (fitxer_id);
