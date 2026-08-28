# Dashboards analytiques Tickets et Bugs — vérification

## Périmètre

Cette refonte remplace les écrans opérationnels Tickets et Bugs par des vues de
pilotage. Aucun ticket Zoho ni aucune issue Linear ne peut être traité depuis ces
pages : les actions restent dans Zoho Desk et Linear.

Routes principales :

- `/tickets` : analytics du support Zoho Desk ;
- `/escalations` : analytics des bugs Linear ;
- `/tickets/analytics`, `/tickets/analytics/other` et `/tickets/[id]` : redirection
  vers `/tickets` ;
- `/escalations/analytics` : redirection vers `/escalations`.

## Architecture des données

### Zoho Desk

`GET /api/zoho/tickets/analytics` accepte `from`, `to`, `product`, `category`,
`classification`, `status`, `priority` et `client`. Les paramètres multi-valeurs
peuvent être répétés. La route page les tickets côté serveur, normalise les
valeurs réelles Zoho puis ne retourne que les KPI, séries temporelles,
répartitions, options de filtre et lignes agrégées client × produit × catégorie.
Les catégories/modules fins Zoho sont regroupés côté serveur dans une taxonomie
provisoire ; seules les familles réellement présentes sur la période sont
proposées au filtre :

| Famille analytique | Règles actuelles |
|---|---|
| Campaigns | Campagne Email et libellés campagne |
| Newsletters | Newsletters et sujets explicitement DNS/SPF/DKIM/DMARC |
| Guest Profile | Guest profile, segmentation, imports/exports CSV |
| CRM Core | Administration, accès et 2FA |
| PMS | Intégration, connecteur et synchronisation PMS |
| WhatsApp | WhatsApp |
| Guest App | Guest App, Pages, Formulaires, Check-in, Commande, Kiosque, Wifi et Statistiques app |
| Hub de messagerie | Hub, conservé comme produit autonome |
| Dmbook Pro | Dmbook, conservé comme produit autonome |
| Loyalty Program | Libellé Zoho Loyalty Program |
| CSM | Conservé tel quel pour permettre une revue métier hebdomadaire |
| Autre | Email delivery/Mailinblack et valeurs sans correspondance fiable |

Cette taxonomie ne prétend pas corriger la donnée source. Plusieurs catégories
Zoho sont anciennes, peu utilisées ou utilisées de manière hétérogène, et des
catégories manquent encore. Le regroupement doit donc être revu avec le métier
et la configuration Zoho devra être remise à plat à terme.

Chaque page Zoho (tri décroissant par création ou modification) est mise en
cache pendant 900 secondes avec `unstable_cache`, puis les pages sont fusionnées
et agrégées en mémoire. Ce découpage maintient chaque entrée sous la limite de
2 Mio de Next.js et permet aux combinaisons de filtres de réutiliser la même
source sans rappeler Zoho. La FCR est signalée dans l’API et l’interface comme
une estimation lorsque l’historique de réouverture complet n’est pas exposé.

### Linear

`GET /api/linear/issues/analytics` accepte `from`, `to`, `label`, `priority`,
`status`, `creator` et `keyword`. La collecte BUGS est paginée par curseur côté
serveur ; chaque page compacte est mise en cache pendant 900 secondes et reste
sous 1,5 Mio. Le mot-clé est appliqué localement sur la source Linear mise en
cache (titre + description), jamais comme recherche full-text distante.

La réponse ne contient que des agrégats : KPI, séries créées/résolues,
répartitions, top créateurs, fréquence des mots et distribution SLA. Les noms
proposés par le filtre Créateur viennent de la liste des membres du workspace
Linear, mise en cache une heure, complétée par les créateurs observés dans la
source afin de conserver les anciens comptes.

La collecte Linear est plafonnée à 5 000 issues afin de borner la mémoire et le
temps d'exécution. Si ce seuil est atteint, la réponse expose `truncated: true`
et le dashboard affiche un avertissement visible plutôt que de présenter les
résultats comme exhaustifs.

## Vérifications automatisées

À exécuter depuis la racine du projet :

```bash
npx tsc --noEmit --pretty false
npm run lint
npm run build
```

Résultat de la passe locale du 15 juillet 2026 : TypeScript, ESLint et build de
production réussis sans erreur ni avertissement. Le build a généré les 30 pages,
y compris les routes et pages Onboarding.

Un appel d'intégration réel à Zoho Desk a également retourné HTTP 200 sur la
fenêtre de 7 jours : 50 tickets agrégés, 7 points temporels et 19 catégories
produit sources, ensuite consolidées dans la taxonomie provisoire du cockpit. La
pagination complète création + période précédente a traité 1 107 tickets sans
troncature ; l'enrichissement des comptes a validé les 100 entrées de la page
échantillonnée.

Après validation de la taxonomie provisoire, ce même échantillon de 50 tickets
se répartit sans famille parasite : Autre 21, CRM Core 10, Guest App 7,
Campaigns 5, Guest Profile 4 et PMS 3. Les familles sans ticket sur la période
restent naturellement absentes du filtre dynamique.

Les lectures Linear réelles ont également réussi : une page de 250 issues BUGS
retourne 381 971 octets, largement sous le plafond de cache de 1,5 Mio, et
indique correctement la page suivante. La requête des membres a retourné 28
membres. Aucun contenu d'issue ni secret n'est consigné dans cette vérification.

Le build couvre également la compilation des routes et pages Onboarding ; les
fichiers de ce module ne sont pas modifiés par cette refonte.

Le temps de première réponse provient de l’endpoint métrique de chaque ticket
Zoho. Sa valeur `HH:MM hrs` est conservée comme durée officielle, calculée selon
les horaires et règles SLA Zoho ; elle reste à `—` uniquement lorsque Zoho ne
renvoie aucune première réponse. La FCR porte explicitement la mention
« estim. » lorsque la métrique ne fournit pas le nombre de réouvertures.

Le backfill Supabase conserve les dates de création et de clôture exposées par
Zoho sur toute la couverture certifiée. Depuis le 20 juillet 2026, un snapshot
quotidien par ticket conserve également son statut et ses dates analytiques du
jour. Ces snapshots utilisent le jour métier `Europe/Paris`, y compris autour
de minuit UTC.

Les états quotidiens antérieurs au 20 juillet 2026 ne sont pas inventés : pour
cette période, seule la dernière valeur connue du ticket et ses dates Zoho sont
disponibles. La FCR reste une estimation lorsque Zoho n’expose pas le nombre de
réouvertures.

Les caches de 15 minutes accélèrent les appels suivants. Le premier appel après
expiration dépend encore du nombre de pages et de la latence des API amont ;
l'objectif de moins de deux secondes doit être mesuré avec cache chaud dans
l'environnement déployé.

Les sparklines du dashboard global représentent l’activité récente, en fenêtre
glissante de sept jours, des objets composant actuellement chaque KPI. Elles ne
reconstruisent pas rétroactivement les états antérieurs au premier snapshot.

## Recette manuelle

Préconditions : session `admin` ou `support`, intégrations Zoho Desk et Linear
configurées.

1. Ouvrir `/tickets` et confirmer la présence des 5 KPI et 6 graphiques.
2. Choisir « 30 jours » et vérifier que `from`/`to` changent dans l’URL et que
   toutes les visualisations se rechargent.
3. Activer le produit `Campaigns` (ou un produit réellement proposé par Zoho) et
   confirmer la mise à jour du compteur et de tous les agrégats.
4. Cliquer sur une barre du Top clients ; vérifier que le client apparaît dans
   l’URL et que le Top clients disparaît pendant ce filtrage.
5. Combiner catégorie, classification, statut et priorité, puis utiliser
   « Réinitialiser les filtres ».
6. Déplier le tableau agrégé, changer le tri et parcourir une page de 20 lignes.
7. Ouvrir `/escalations` et confirmer la présence des 5 KPI et 7 graphiques.
8. Choisir « 90 jours », un créateur et plusieurs labels ; vérifier le compteur
   et les séries.
9. Saisir `PMS` dans le filtre mot-clé ; attendre le debounce et confirmer que
   l’URL ainsi que les agrégats sont mis à jour.
10. Vérifier que les tranches `7–14 j`, `14–30 j` et `> 30 j` de la distribution
    SLA utilisent la couleur critique rouge.
11. Tester les liens externes « Ouvrir Zoho Desk ↗ » et « Ouvrir Linear ↗ ».
12. Sur mobile, vérifier l’empilement en une colonne et le défilement horizontal
    limité aux contrôles/tableaux qui le nécessitent.
13. Confirmer dans la sidebar les seuls libellés `Tickets` et `Bugs`.
14. Ouvrir `/dashboard` : conserver les 4 KPI et leurs tendances 30 jours, sans
    liste individuelle « Tickets à traiter ».
15. Parcourir `/onboarding`, `/onboarding/board`, `/onboarding/pilotage` et un
    projet `/onboarding/[id]` pour la non-régression fonctionnelle.

## Cas d’erreur attendus

- Une intégration absente affiche un état explicite, sans données inventées.
- Une plage invalide retourne HTTP 400.
- Une indisponibilité amont retourne HTTP 502/503 et laisse les filtres
  réutilisables pour relancer la requête.
- Les réponses n’exposent ni description complète d’issue dans le navigateur,
  ni ticket individuel Zoho.
