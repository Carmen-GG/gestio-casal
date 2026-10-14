# Adjudicació de places

> **Estat:** la regla de Can Boada la va indicar el casal el 14/10/2026 i és la que
> omple el formulari per defecte (vegeu [Regla del casal](#regla-del-casal)). Tots els
> paràmetres continuen sent configurables. Cal que el casal (o l'Ajuntament) la deixi
> per escrit abans de fer una adjudicació real.

## Regla del casal

Indicada pel casal el 14/10/2026:

1. **Prioritat absoluta:** qui va quedar en **llista d'espera** de l'activitat el **cicle anterior** havent-la triat com a **1a o 2a preferència**.
2. **Després, per preferència:** primer s'assignen les 1es preferències de tothom, després les 2es, etc. (mètode per rondes).
3. **Sorteig a cada activitat** quan hi ha més sol·licituds que places. N'hi ha de dos tipus:
   - **De número.** Cada persona té un número: el **de sol·licitud** (ordre d'inscripció) o un **número aleatori** que l'aplicació assigna a cada sol·licitud en tancar les inscripcions. Es sorteja un número i es comença per la persona que el té, continuant en ordre i tornant a començar per l'1.
   - **De lletra.** Es sorteja una lletra i es comença pel primer cognom que comença per aquella lletra, en ordre alfabètic, tornant a començar per l'A.
4. **Llistat de persones sense cap activitat:** amb quantes n'havien demanat i on són de la llista d'espera, per revisar-les a mà.
5. **Mínim de participants** (habitualment 15 en adults i 8 en infantils i juvenils): es configura a cada activitat i només genera avisos.

Dins de la prioritat absoluta també es respecta la preferència (qui la tenia de 1a passa davant de qui la tenia de 2a) i, després, el sorteig de l'activitat. Si les persones amb prioritat superen les places, queden al capdavant de la llista d'espera.

### Sorteig

- Es fa a la secció «Sorteig per activitat» del cicle, amb les inscripcions tancades o l'adjudicació en procés. Només cal per a les activitats amb més sol·licituds que places; sense tots aquests sortejos no es pot calcular la proposta.
- **Pantalla de sorteig:** una pantalla gran per projectar-la o emetre-la en directe. Instagram no permet que una aplicació externa emeti directament. Es pot gravar la pantalla amb el mòbil o compartir-la amb **Instagram Live Producer** des d'un ordinador (per exemple, amb OBS).
- El número o la lletra el decideix el **servidor** amb un generador aleatori criptogràfic. L'animació de la pantalla és només visual.
- També es pot **registrar un sorteig fet a mà** (amb bombo, en directe…). Queda marcat com a «fet a mà».
- Cada sorteig queda registrat amb la data, l'hora, qui l'ha fet i el rang de números, i a l'auditoria. **No es pot modificar ni esborrar.** Per repetir-lo cal anul·lar-lo amb un motiu, i l'anul·lació també queda registrada.
- Els **números aleatoris** s'assignen una sola vegada (permutació aleatòria de 1 a N) i no es poden canviar. Si després entra alguna sol·licitud nova, rep el número següent. La llista es pot exportar per publicar-la abans del sorteig.
- La proposta desa quins sortejos s'han aplicat. Si algun sorteig canvia entre el càlcul i la confirmació, la proposta queda obsoleta.

### Reconeixement de la mateixa persona entre cicles

Per a la prioritat de la llista d'espera anterior (i per a la continuïtat) es considera que és la mateixa persona quan coincideix:

- el mateix registre de participant, o
- el mateix codi intern del casal, o
- el mateix document d'identitat (sense espais ni guions), o
- el mateix nom i cognoms (sense accents ni majúscules) **i** la mateixa data de naixement o el mateix telèfon.

El nom sol no n'hi ha prou. **Pendent de validar pel casal.** Si el formulari no demana ni la data de naixement ni el telèfon, només funcionarà amb el codi intern o el document.

## Com funciona

1. **Paràmetres.** Al panell del cicle, a la secció «Adjudicació», es desen els paràmetres.
   - Cada desament crea una **versió nova**: les anteriors no es poden modificar, perquè ho impedeix un *trigger* a la base de dades.
   - Cada proposta indica amb quina versió s'ha calculat.
2. **Proposta.** Quan el cicle és «En procés d'adjudicació», es pot calcular una proposta.
   - El motor és una funció pura (`shared/domain/adjudicacio.ts`), separada de la interfície i de la base de dades.
   - Es desa el resultat de cada parella sol·licitud-activitat.
   - Calcular una proposta nova marca les anteriors pendents com a «descartades». No s'esborren.
3. **Revisió i confirmació.** La proposta es revisa per activitat i es pot exportar a XLSX abans de confirmar-la.
   - En confirmar-la, es creen les places i les llistes d'espera, i el cicle passa a «Adjudicat».
   - Si les sol·licituds, les activitats o les renúncies han canviat des del càlcul, la confirmació es rebutja i cal calcular una proposta nova. Es comprova amb una empremta SHA-256 de les dades d'entrada.
4. **Substitució.** No es pot recalcular una adjudicació confirmada sense una operació explícita:
   - Cal tornar el cicle a «En procés d'adjudicació», que requereix confirmació i motiu.
   - Després es calcula una proposta nova i es confirma, i aquesta confirmació també requereix motiu.
   - L'adjudicació anterior queda com a «substituïda», amb l'enllaç a la nova, i es conserva sencera.
   - Les renúncies i baixes registrades a mà es respecten: aquestes parelles no es tornen a adjudicar.
5. **Places.** Després de confirmar, a «Places i llistes d'espera», es poden fer aquestes accions:
   - registrar renúncies i baixes;
   - oferir una vacant a qui és en llista d'espera, i registrar-ne l'acceptació o el retorn a la llista;
   - admetre directament algú de la llista d'espera.

   Cada acció exigeix un motiu i queda als moviments de la plaça i a l'auditoria. Oferir o admetre només és possible si queda capacitat lliure, i això es comprova dins de la mateixa transacció.

## Paràmetres

| Paràmetre | Valors | Valor inicial del formulari |
|---|---|---|
| Prioritat per la llista d'espera anterior | Sí / No, i fins a quina preferència (1–30) | Sí, preferències 1 i 2 |
| Ordre de prioritat | Sorteig a cada activitat · Ordre d'inscripció · Sorteig de lletra · Sorteig amb llavor | Sorteig a cada activitat |
| Tipus de sorteig per activitat | Número · Lletra | Número |
| Número de cada persona | Número de sol·licitud · Número aleatori | Número de sol·licitud |
| Mètode | Per rondes · Per persona (no amb sorteig per activitat) | Per rondes |
| Màxim d'activitats admeses per persona | 1–30 o sense límit | Sense límit |
| Prioritat per continuïtat | Sí / No | No |
| Llista d'espera | Sí / No | Sí |
| Sol·licituds que hi entren | Rebuda, Validada, Pendent de revisió | Rebuda i Validada |

Els valors inicials només omplen el formulari: no s'apliquen fins que algú desa els paràmetres. Els paràmetres desats abans d'aquesta versió conserven el comportament que tenien (sense prioritat per la llista d'espera anterior).

### Ordre de prioritat

- **Sorteig a cada activitat:** vegeu [Regla del casal](#regla-del-casal). Cada activitat té el seu ordre.

Les altres opcions fan servir un sol ordre per a tot el cicle:

- **Ordre d'inscripció:** per data i hora de recepció al servidor. Si coincideixen, decideix el número de sol·licitud.
- **Sorteig de lletra:** ordre alfabètic per primer cognom, segon cognom i nom, començant per la lletra sortejada i continuant per l'A.
  - La clau d'ordenació no té en compte accents, majúscules ni apòstrofs.
  - La lletra la pot introduir la persona gestora (sorteig públic) o la pot sortejar el servidor amb un generador criptogràfic.
  - En tots dos casos queda registrada a l'execució.
- **Sorteig amb llavor:** el servidor genera una llavor aleatòria i la desa. L'ordre es deriva de la llavor i de l'identificador de cada sol·licitud (FNV-1a), de manera que es pot reproduir exactament.

### Mètode

- **Per rondes:**
  - Primera ronda: la 1a preferència de cada persona, seguint l'ordre de prioritat.
  - Segona ronda: la 2a preferència, i així successivament.
  - Prioritza que tothom obtingui la seva primera opció.
- **Per persona:** cada persona, seguint l'ordre de prioritat, obté totes les preferències que pugui abans de passar a la següent.

### Màxim d'activitats

- Es compta per **persona** (participant), encara que tingui més d'una sol·licitud.
- Quan una persona arriba al màxim, les preferències que encara no s'han decidit queden «sense plaça» amb el motiu «Ja té el màxim d'activitats».
- Les llistes d'espera on ja era abans de prendre aquesta decisió es mantenen.

### Llista d'espera

- La posició a la llista d'espera de cada activitat és l'ordre en què el motor ha intentat adjudicar aquella plaça.
- En el mètode per rondes, això vol dir per número de preferència i, dins de cada preferència, per l'ordre de prioritat.

### Continuïtat

Si està activada, abans de la fase general el motor adjudica, activitat per activitat, les places de les persones que tenen dret de continuïtat. Una persona té dret de continuïtat quan es compleixen aquestes condicions:

- Hi ha un **cicle anterior** del mateix casal, el més recent amb data d'inici anterior i amb una adjudicació confirmada.
- La **mateixa persona** hi tenia una plaça admesa en una activitat equivalent.
- L'activitat és **equivalent** si té el mateix codi extern, el mateix nom o un enllaç explícit (`configuracio_continuitat.activitat_anterior_id`).

La mateixa persona es reconeix amb el criteri de l'apartat [Reconeixement de la mateixa persona entre cicles](#reconeixement-de-la-mateixa-persona-entre-cicles).

## Què cal validar

1. Deixar per escrit la regla del casal (prioritat per la llista d'espera anterior, preferència i sorteig per activitat) i quin tipus de sorteig fa cada casal.
2. El criteri per reconèixer la mateixa persona entre cicles.
3. Si «quedar en llista d'espera» inclou qui va rebutjar una plaça oferta (ara només compta qui hi era al final del cicle).
4. El nombre màxim d'activitats per persona.
5. Si les sol·licituds pendents de revisió entren a l'adjudicació.
6. Com es comunica la resolució. L'enviament de comunicacions no està implementat.
