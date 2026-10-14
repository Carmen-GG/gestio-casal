# Adjudicació de places

> **Estat: pendent de validació.** Cap d'aquests paràmetres reprodueix una normativa
> oficial. El casal (o l'Ajuntament) ha de decidir quins valors s'apliquen i
> deixar-ho per escrit abans de fer una adjudicació real.

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
| Ordre de prioritat | Ordre d'inscripció · Sorteig de lletra · Sorteig amb llavor | Ordre d'inscripció |
| Mètode | Per rondes · Per persona | Per rondes |
| Màxim d'activitats admeses per persona | 1–30 o sense límit | Sense límit |
| Prioritat per continuïtat | Sí / No | No |
| Llista d'espera | Sí / No | Sí |
| Sol·licituds que hi entren | Rebuda, Validada, Pendent de revisió | Rebuda i Validada |

Els valors inicials només omplen el formulari: no s'apliquen fins que algú desa els paràmetres.

### Ordre de prioritat

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
- La **mateixa persona** (el mateix participant) hi tenia una plaça admesa en una activitat equivalent.
- L'activitat és **equivalent** si té el mateix codi extern, el mateix nom o un enllaç explícit (`configuracio_continuitat.activitat_anterior_id`).

**Limitació:** cada sol·licitud del formulari públic crea una persona nova. Per tant, la continuïtat només funciona quan les persones s'identifiquen amb el mateix codi intern de participant, per exemple en una importació. Cal decidir com s'identifiquen les persones entre cicles.

## Què cal validar

1. Quina regla d'ordre s'aplica: inscripció, sorteig de lletra o sorteig amb llavor.
2. Si el sorteig ha de ser públic, i com es documenta.
3. Si les persones que repeteixen tenen prioritat, i fins a quin límit.
4. El nombre màxim d'activitats per persona.
5. Si les sol·licituds pendents de revisió entren a l'adjudicació.
6. Com es comunica la resolució. L'enviament de comunicacions no està implementat.
