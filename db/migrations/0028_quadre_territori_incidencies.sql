-- Quadre de comandament de la superadministració (petició de 2026-10-16): estadístiques per
-- casal, comarca, demarcació territorial o referent, i nous indicadors (incidències, activitats
-- sense tallerista i faltes d'assistència de la tallerista).

-- Referents: persones de la superadministració que porten un grup de casals.
CREATE TABLE referents (
  id              TEXT PRIMARY KEY,
  nom             TEXT NOT NULL CHECK (length(trim(nom)) BETWEEN 2 AND 120),
  email           TEXT CHECK (email IS NULL OR length(email) <= 254),
  actiu           INTEGER NOT NULL DEFAULT 1 CHECK (actiu IN (0, 1)),
  creat_el        TEXT NOT NULL,
  actualitzat_el  TEXT NOT NULL
);

ALTER TABLE casals ADD COLUMN comarca TEXT CHECK (comarca IS NULL OR length(comarca) <= 80);
ALTER TABLE casals ADD COLUMN demarcacio TEXT CHECK (demarcacio IS NULL OR length(demarcacio) <= 80);
ALTER TABLE casals ADD COLUMN referent_id TEXT REFERENCES referents (id);

-- Proposta inicial a partir del municipi (comarca oficial; demarcació segons els serveis
-- territorials). Es pot corregir a «Territori i referents».
UPDATE casals SET comarca = 'Montsià', demarcacio = 'Terres de l''Ebre' WHERE municipi = 'Alcanar';
UPDATE casals SET comarca = 'Maresme', demarcacio = 'Barcelona' WHERE municipi = 'Arenys de Mar';
UPDATE casals SET comarca = 'Barcelonès', demarcacio = 'Barcelona' WHERE municipi = 'Badalona';
UPDATE casals SET comarca = 'Vallès Occidental', demarcacio = 'Barcelona' WHERE municipi = 'Badia del Vallès';
UPDATE casals SET comarca = 'Noguera', demarcacio = 'Lleida' WHERE municipi = 'Balaguer';
UPDATE casals SET comarca = 'Bages', demarcacio = 'Catalunya Central' WHERE municipi = 'Balsareny';
UPDATE casals SET comarca = 'Pla de l''Estany', demarcacio = 'Girona' WHERE municipi = 'Banyoles';
UPDATE casals SET comarca = 'Barcelonès', demarcacio = 'Barcelona' WHERE municipi = 'Barcelona';
UPDATE casals SET comarca = 'Berguedà', demarcacio = 'Catalunya Central' WHERE municipi = 'Berga';
UPDATE casals SET comarca = 'Selva', demarcacio = 'Girona' WHERE municipi = 'Blanes';
UPDATE casals SET comarca = 'Baix Camp', demarcacio = 'Tarragona' WHERE municipi = 'Cambrils';
UPDATE casals SET comarca = 'Vallès Oriental', demarcacio = 'Barcelona' WHERE municipi = 'Canovelles';
UPDATE casals SET comarca = 'Bages', demarcacio = 'Catalunya Central' WHERE municipi = 'Cardona';
UPDATE casals SET comarca = 'Segarra', demarcacio = 'Lleida' WHERE municipi = 'Cervera';
UPDATE casals SET comarca = 'Baix Llobregat', demarcacio = 'Barcelona' WHERE municipi = 'Cornellà de Llobregat';
UPDATE casals SET comarca = 'Alta Ribagorça', demarcacio = 'Lleida' WHERE municipi = 'El Pont de Suert';
UPDATE casals SET comarca = 'Alt Empordà', demarcacio = 'Girona' WHERE municipi = 'El Port de la Selva';
UPDATE casals SET comarca = 'Baix Llobregat', demarcacio = 'Barcelona' WHERE municipi = 'El Prat de Llobregat';
UPDATE casals SET comarca = 'Baix Penedès', demarcacio = 'Tarragona' WHERE municipi = 'El Vendrell';
UPDATE casals SET comarca = 'Baix Llobregat', demarcacio = 'Barcelona' WHERE municipi = 'Esplugues de Llobregat';
UPDATE casals SET comarca = 'Alt Empordà', demarcacio = 'Girona' WHERE municipi = 'Figueres';
UPDATE casals SET comarca = 'Gironès', demarcacio = 'Girona' WHERE municipi = 'Girona';
UPDATE casals SET comarca = 'Vallès Oriental', demarcacio = 'Barcelona' WHERE municipi = 'Granollers';
UPDATE casals SET comarca = 'Barcelonès', demarcacio = 'Barcelona' WHERE municipi = 'Hospitalet de Llobregat';
UPDATE casals SET comarca = 'Anoia', demarcacio = 'Catalunya Central' WHERE municipi = 'Igualada';
UPDATE casals SET comarca = 'Baix Ebre', demarcacio = 'Terres de l''Ebre' WHERE municipi = 'L''Ametlla de Mar';
UPDATE casals SET comarca = 'Barcelonès', demarcacio = 'Barcelona' WHERE municipi = 'L''Hospitalet de Llobregat';
UPDATE casals SET comarca = 'Pallars Jussà', demarcacio = 'Lleida' WHERE municipi = 'La Pobla de Segur';
UPDATE casals SET comarca = 'Montsià', demarcacio = 'Terres de l''Ebre' WHERE municipi = 'La Ràpita';
UPDATE casals SET comarca = 'Alt Urgell', demarcacio = 'Lleida' WHERE municipi = 'La Seu d''Urgell';
UPDATE casals SET comarca = 'Garrigues', demarcacio = 'Lleida' WHERE municipi = 'Les Borges Blanques';
UPDATE casals SET comarca = 'Vallès Oriental', demarcacio = 'Barcelona' WHERE municipi = 'Les Franqueses del Vallès';
UPDATE casals SET comarca = 'Segrià', demarcacio = 'Lleida' WHERE municipi = 'Lleida';
UPDATE casals SET comarca = 'Vallès Oriental', demarcacio = 'Barcelona' WHERE municipi = 'Llinars del Vallès';
UPDATE casals SET comarca = 'Osona', demarcacio = 'Catalunya Central' WHERE municipi = 'Manlleu';
UPDATE casals SET comarca = 'Bages', demarcacio = 'Catalunya Central' WHERE municipi = 'Manresa';
UPDATE casals SET comarca = 'Maresme', demarcacio = 'Barcelona' WHERE municipi = 'Mataró';
UPDATE casals SET comarca = 'Baix Llobregat', demarcacio = 'Barcelona' WHERE municipi = 'Molins de Rei';
UPDATE casals SET comarca = 'Vallès Occidental', demarcacio = 'Barcelona' WHERE municipi = 'Montcada i Reixac';
UPDATE casals SET comarca = 'Baix Llobregat', demarcacio = 'Barcelona' WHERE municipi = 'Olesa de Montserrat';
UPDATE casals SET comarca = 'Garrotxa', demarcacio = 'Girona' WHERE municipi = 'Olot';
UPDATE casals SET comarca = 'Baix Empordà', demarcacio = 'Girona' WHERE municipi = 'Palamós';
UPDATE casals SET comarca = 'Noguera', demarcacio = 'Lleida' WHERE municipi = 'Ponts';
UPDATE casals SET comarca = 'Baix Camp', demarcacio = 'Tarragona' WHERE municipi = 'Reus';
UPDATE casals SET comarca = 'Ripollès', demarcacio = 'Girona' WHERE municipi = 'Ripoll';
UPDATE casals SET comarca = 'Alt Empordà', demarcacio = 'Girona' WHERE municipi = 'Roses';
UPDATE casals SET comarca = 'Vallès Occidental', demarcacio = 'Barcelona' WHERE municipi = 'Rubí';
UPDATE casals SET comarca = 'Vallès Occidental', demarcacio = 'Barcelona' WHERE municipi = 'Sabadell';
UPDATE casals SET comarca = 'Bages', demarcacio = 'Catalunya Central' WHERE municipi = 'Sallent';
UPDATE casals SET comarca = 'Gironès', demarcacio = 'Girona' WHERE municipi = 'Salt';
UPDATE casals SET comarca = 'Barcelonès', demarcacio = 'Barcelona' WHERE municipi = 'Sant Adrià de Besòs';
UPDATE casals SET comarca = 'Baix Llobregat', demarcacio = 'Barcelona' WHERE municipi = 'Sant Boi de Llobregat';
UPDATE casals SET comarca = 'Baix Llobregat', demarcacio = 'Barcelona' WHERE municipi = 'Sant Joan Despí';
UPDATE casals SET comarca = 'Bages', demarcacio = 'Catalunya Central' WHERE municipi = 'Sant Joan de Vilatorrada';
UPDATE casals SET comarca = 'Baix Llobregat', demarcacio = 'Barcelona' WHERE municipi = 'Sant Vicenç dels Horts';
UPDATE casals SET comarca = 'Barcelonès', demarcacio = 'Barcelona' WHERE municipi = 'Santa Coloma de Gramenet';
UPDATE casals SET comarca = 'Vallès Occidental', demarcacio = 'Barcelona' WHERE municipi = 'Santa Perpètua de Mogoda';
UPDATE casals SET comarca = 'Solsonès', demarcacio = 'Catalunya Central' WHERE municipi = 'Solsona';
UPDATE casals SET comarca = 'Pallars Sobirà', demarcacio = 'Lleida' WHERE municipi = 'Sort';
UPDATE casals SET comarca = 'Tarragonès', demarcacio = 'Tarragona' WHERE municipi = 'Tarragona';
UPDATE casals SET comarca = 'Vallès Occidental', demarcacio = 'Barcelona' WHERE municipi = 'Terrassa';
UPDATE casals SET comarca = 'Osona', demarcacio = 'Catalunya Central' WHERE municipi = 'Torelló';
UPDATE casals SET comarca = 'Baix Ebre', demarcacio = 'Terres de l''Ebre' WHERE municipi = 'Tortosa';
UPDATE casals SET comarca = 'Selva', demarcacio = 'Girona' WHERE municipi = 'Tossa de Mar';
UPDATE casals SET comarca = 'Pallars Jussà', demarcacio = 'Lleida' WHERE municipi = 'Tremp';
UPDATE casals SET comarca = 'Urgell', demarcacio = 'Lleida' WHERE municipi = 'Tàrrega';
UPDATE casals SET comarca = 'Baix Llobregat', demarcacio = 'Barcelona' WHERE municipi = 'Vallirana';
UPDATE casals SET comarca = 'Osona', demarcacio = 'Catalunya Central' WHERE municipi = 'Vic';
UPDATE casals SET comarca = 'Alt Penedès', demarcacio = 'Barcelona' WHERE municipi = 'Vilafranca del Penedès';
UPDATE casals SET comarca = 'Garraf', demarcacio = 'Barcelona' WHERE municipi = 'Vilanova i la Geltrú';

-- Nom de la persona tallerista de l'activitat (buit: activitat sense tallerista assignada).
ALTER TABLE activitats ADD COLUMN tallerista TEXT CHECK (tallerista IS NULL OR length(tallerista) <= 120);

-- La tallerista no ha vingut a la sessió.
ALTER TABLE sessions_activitat ADD COLUMN tallerista_absent INTEGER NOT NULL DEFAULT 0 CHECK (tallerista_absent IN (0, 1));
ALTER TABLE sessions_activitat ADD COLUMN tallerista_motiu TEXT CHECK (tallerista_motiu IS NULL OR length(tallerista_motiu) <= 200);

-- Incidències registrades pels casals. La descripció no ha de contenir dades personals.
CREATE TABLE incidencies (
  id              TEXT PRIMARY KEY,
  casal_id        TEXT NOT NULL REFERENCES casals (id),
  data            TEXT NOT NULL,
  categoria       TEXT NOT NULL CHECK (categoria IN ('instal·lacions', 'convivencia', 'salut', 'tallerista', 'activitat', 'plataforma', 'altres')),
  descripcio      TEXT NOT NULL CHECK (length(descripcio) BETWEEN 3 AND 1000),
  activitat_id    TEXT REFERENCES activitats (id),
  estat           TEXT NOT NULL DEFAULT 'oberta' CHECK (estat IN ('oberta', 'resolta')),
  resolucio       TEXT CHECK (resolucio IS NULL OR length(resolucio) <= 1000),
  creat_per       TEXT,
  resolta_per     TEXT,
  resolta_el      TEXT,
  creat_el        TEXT NOT NULL,
  actualitzat_el  TEXT NOT NULL
);
CREATE INDEX idx_incidencies_casal ON incidencies (casal_id, data);
