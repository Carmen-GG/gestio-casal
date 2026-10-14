# ADR 0002 · D1 com a base de dades i integritat a nivell SQL

**Estat:** acceptada (Fase 1), pendent de validació institucional per a dades reals

## Decisió
- D1 (SQLite gestionat) amb migracions SQL numerades a `db/migrations`, aplicades amb
  `wrangler d1 migrations apply`.
- Identificadors UUID v4, dates en ISO 8601 UTC, JSON validat amb `json_valid`.
- Les regles que protegeixen la integritat es defineixen a la base de dades:
  claus foranes compostes per casal i cicle, preferència única per sol·licitud,
  número i data de recepció immutables, sol·licituds, resultats d'adjudicació confirmats,
  historial i auditoria no esborrables, una sola adjudicació confirmada per cicle.
- Escriptures relacionades en un sol lot (`batch`, transaccional a D1). Les inserts d'historial i
  d'auditoria es condicionen a un testimoni aleatori (`darrera_operacio`) desat per l'escriptura
  principal, per no registrar canvis que no s'han produït.

## Limitacions conegudes de D1
- Mida màxima per base de dades (10 GB en el pla de pagament) i una sola regió primària.
- Sense col·lacions per a català: l'ordenació alfabètica fa servir una clau normalitzada
  calculada al servidor (`shared/domain/ordenacio.ts`).
- Cal confirmar la ubicació de les dades (jurisdicció UE) i les condicions contractuals
  (vegeu `validacio-institucional.md`).
