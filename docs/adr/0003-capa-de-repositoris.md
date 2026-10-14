# ADR 0003 · Capa de repositoris

**Estat:** acceptada (Fase 1)

## Decisió
Les rutes i els serveis depenen de les interfícies de `worker/repositories/tipus.ts`.
La implementació actual és `worker/repositories/d1/`. Les operacions d'escriptura que s'han
d'agrupar es representen amb un tipus opac `Operacio` i s'executen amb `UnitatDeTreball`.

## Migració futura a PostgreSQL o a una base de dades corporativa
1. Traduir les migracions (la sintaxi és SQL estàndard excepte `json_valid`, `GLOB` i els *triggers*).
2. Escriure una implementació nova de cada repositori i de `UnitatDeTreball` (transacció real).
3. Canviar la fàbrica `repositorisD1` a `worker/app.ts`. Serveis, rutes i frontend no canvien.
4. Executar la mateixa bateria de proves contra la nova implementació.
