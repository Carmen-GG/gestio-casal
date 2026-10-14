# Model de dades

Migracions: `db/migrations/0001` a `0006`. Totes les dates són ISO 8601 UTC.

| Taula | Contingut | Regles destacades |
|---|---|---|
| `casals` | Casals cívics (codi, nom, municipi, configuració) | `codi` únic en majúscules |
| `usuaris` | Personal autoritzat (sense contrasenyes) | Identitat delegada (`dev` o `entra_id`) |
| `rols`, `permisos`, `rols_permisos` | Catàleg de rols i permisos dels dos mòduls | Dades de referència |
| `assignacions_rols` | Rol d'un usuari en un casal (o global) | Es revoquen, no s'esborren; abast coherent per *trigger* |
| `cicles` | Cicles d'activitats i configuració del formulari | Estats tancats; dates coherents; `versio` per a concurrència |
| `activitats` | Activitats d'un cicle (horari, capacitat, difusió, continuïtat) | Clau forana `(cicle_id, casal_id)`; `codi_extern` únic per cicle |
| `historial_canvis` | Qui, quan, què i per què de cada canvi | Inalterable |
| `participants` | Dades personals, una sola vegada per casal | Només nom i primer cognom obligatoris; `clau_ordenacio` |
| `sollicituds` | Sol·licitud d'inscripció | `numero` i `rebuda_el` immutables; idempotència per cicle; no s'esborra (s'anul·la) |
| `preferencies` | Activitats triades i ordre | Ordre únic per sol·licitud; activitat del mateix cicle |
| `configuracions_adjudicacio` | Paràmetres versionats per cicle | Inalterables (nova versió per canviar) |
| `execucions_adjudicacio` | Cada execució del motor | Proposta → confirmada → substituïda; una confirmada per cicle; no s'esborra |
| `resultats_adjudicacio` | Resultat per sol·licitud i activitat | Posició d'espera explícita; inalterables |
| `places`, `moviments_places` | Estat operatiu de places i llista d'espera | Cada moviment queda registrat |
| `sessions_activitat`, `registres_assistencia` | Sessions i marques d'assistència | Una marca per plaça i sessió |
| `registres_auditoria` | Operacions rellevants | Inalterable; sense dades personals |

### PG-Cartells (migració 0013)
| Taula | Contingut | Regles destacades |
|---|---|---|
| `cartells_fitxers` | Metadades dels fitxers desats a R2 (ús, tipus, mida, SHA-256, qui i quan) | `casal_id` nul = recurs comú; immutable (ni es modifica ni s'esborra) |
| `cartells_plantilles` | Plantilles de cartell i d'Instagram: classificació, estat, mida de pàgina, format de sortida i camps amb el seu rol | Referencia un fitxer d'ús `plantilla` (un sol cop) i, opcionalment, un de `previsualitzacio`; no s'esborra; `versio` per a concurrència |

Les properes taules del mòdul (continguts, materials generats) referenciaran `casals`, `cicles`,
`activitats` i `usuaris`.
