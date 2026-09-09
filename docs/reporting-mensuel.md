# Reporting mensuel pour les slides

Dans `/reporting`, sélectionner le mois puis « Copier les données des slides ».
Le sélecteur trimestriel reste indépendant. Le périmètre est le Support CRM
synchronisé et les projets d’onboarding ; ce n’est pas le global D-EDGE.

## Définitions

- `/api/reporting/monthly?month=2026-08` : créations selon `created_at`, clôtures
  selon `resolved_at`, même pour un ticket créé avant le mois. Les dates sont les
  valeurs actuellement synchronisées, pas un journal exhaustif des transitions.
- Première réponse : métrique Zoho `first_response_time_ms` lorsqu’elle existe,
  sinon écart `first_response_at - created_at`. La couverture est affichée.
  Ce n’est pas la première action et aucun SLA P1–P4 n’est déduit.
- Résolution : temps calendaire création → clôture, sur les clôtures documentées
  dont le délai est inférieur ou égal à 90 jours. Les délais strictement supérieurs
  sont exclus uniquement de cette moyenne ; le volume clôturé et le FCR restent
  inchangés. Le seuil, le nombre retenu, les exclusions et les durées manquantes
  sont affichés et copiés avec la synthèse. Aucune durée retenue : « — ».
- FCR : estimation existante, sur les clôtures dont le booléen est renseigné.
- Implémentation : dates de début Zoho (potentiellement planifiées), dates réelles
  de mise en production, délai sur les deux dates connues. Aucune assimilation aux
  catégories Welcome / Setup tant que leur correspondance métier est inconnue.
- Portefeuille : statuts actuels des projets synchronisés, pas le stock historique
  de fin de mois ni le tableau des décisions des trois équipes.

## Canaux et limites

`/api/reporting/channels?from=2024-09-01&to=2026-09-01` utilise une borne de début
incluse et une borne de fin exclue. Les dates seules commencent à minuit à Paris ;
les horodatages ISO doivent porter leur fuseau. Sans paramètres, la fenêtre couvre
24 mois glissants jusqu’à maintenant, avec des mois de bord partiels. L’interface
affiche les 24 mois calendaires se terminant au mois sélectionné.

Le canal brut est conservé : Email, Phone, Web, Chat, autre/non renseigné.
`mapSource()` n’est jamais utilisé. Les lectures sont paginées par 1 000 et triées
par identifiant, sans renvoyer d’identifiant ou de ticket individuel au navigateur.

`RATIO_APPELS_PAR_TICKET` est exporté depuis `lib/reporting/monthly.ts` : Next.js 14
n’autorise pas d’export arbitraire dans un `route.ts`. Toute estimation utilise cette
constante. L’hypothèse de 2 tickets par appel n’est pas validée. La moyenne mensuelle
estimée inclut tous les mois affichés, même partiels ou non certifiés. Les mesures
réelles des slides (entrants, manqués, décrochés <30 s) restent indisponibles.

La zone grisée commence en mars 2026, avec mars–avril comme transition. La baisse
Phone reflète l’arrêt de la prise d’appels et ne démontre pas une baisse de demande.
Aucune variation Phone n’est calculée.

Les bornes déclarées du backfill ne démontrent pas l’exhaustivité. Un volume inférieur
à 20 % de la médiane des six derniers mois complets affichés (au moins trois mois,
médiane d’au moins 50 tickets) déclenche « à vérifier ». Ce signal ne corrige aucune
donnée et ne démontre pas à lui seul un trou historique.

## Vérification

`npx tsc --noEmit --pretty false`, `npm run lint`, `npm run build`, `npm test`.
Les tests `tests/reporting-monthly.test.ts` couvrent les fuseaux et bornes, le canal
Web, les valeurs absentes, les clôtures de tickets anciens et l’historique clairsemé.
Le test navigateur local utilise les composants réels et les handlers Supabase
réels sur une adresse de boucle locale ; il n’exerce pas l’enveloppe de connexion.
