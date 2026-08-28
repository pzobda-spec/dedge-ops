# Support case : Campagne email non envoyée

## Introduction

**Description du problème :** Un client signale qu'une campagne email programmée ou déclenchée manuellement n'a pas été envoyée, a été envoyée partiellement, ou n'est pas parvenue aux destinataires.

**Contexte d'utilisation :** Utiliser cette procédure pour tout ticket signalant l'absence d'envoi d'une campagne (campagne séjour, newsletter, pre-stay, post-stay, ou campagne manuelle).

> **À distinguer dès le départ :**
> - La campagne n'a **pas été envoyée** (bloquée côté plateforme) → cette procédure.
> - La campagne a été envoyée mais les emails **n'arrivent pas chez les destinataires** → voir procédure *Délivrabilité email*.

---

## Prérequis

### Informations à collecter auprès du client

- Nom ou référence de la campagne
- Type de campagne (manuelle, automatique pre/post-stay, newsletter)
- Date et heure d'envoi programmés ou déclenchés
- Segment ciblé (nombre de contacts attendus)
- Message d'erreur éventuel dans l'interface

### Outils nécessaires

- `[PLACEHOLDER — module Campagnes dans l'interface LoungeUp : chemin d'accès]`
- `[PLACEHOLDER — logs d'envoi campagne : nom + accès]`
- `[PLACEHOLDER — outil de monitoring des files d'envoi (queue) : nom + accès]`
- `[PLACEHOLDER — panneau d'administration : statut des campagnes]`
- Zoho Desk (ticket client)

---

## Processus de diagnostic

### Étape 1 : Localiser la campagne et vérifier son statut

**Description :** Confirmer l'état réel de la campagne dans la plateforme.

**Actions :**

1. Aller dans `[PLACEHOLDER — menu Campagnes]`.
2. Rechercher la campagne par nom ou date.
3. Identifier le statut affiché :
   - **Envoyée** → la campagne a bien été traitée. Aller à l'étape 2 (problème de réception).
   - **En cours** → l'envoi est en cours, informer le client et surveiller.
   - **Programmée** → l'envoi n'a pas encore eu lieu, vérifier la date/heure programmée.
   - **Brouillon** → la campagne n'a jamais été envoyée, le client ne l'a pas confirmée. Informer.
   - **Erreur / Bloquée** → aller à l'étape 3.
   - **Annulée** → aller à l'étape 4.

**Résultat attendu :** Comprendre où la campagne est bloquée dans son cycle.

---

### Étape 2 : La campagne est marquée "envoyée" mais le client ne l'a pas reçue

**Description :** Décaler vers un problème de délivrabilité.

**Actions :**

1. Vérifier dans `[PLACEHOLDER — logs d'envoi]` que des emails ont bien été préparés et mis en file.
2. Vérifier le nombre d'emails envoyés vs. le segment attendu.
   - Si les chiffres correspondent → rediriger vers la procédure *Délivrabilité email*.
   - Si le nombre est 0 ou inférieur → aller à l'étape 5 (problème de segment).

---

### Étape 3 : La campagne est en erreur ou bloquée

**Description :** Une erreur technique empêche l'envoi.

**Actions :**

1. Consulter le message d'erreur dans `[PLACEHOLDER — logs / détail campagne]`.
2. Identifier le type d'erreur :
   - `[PLACEHOLDER — erreur "quota dépassé"]` → aller à l'étape 6.
   - `[PLACEHOLDER — erreur "expéditeur non valide" ou "domaine non configuré"]` → aller à l'étape 7.
   - `[PLACEHOLDER — erreur technique générique]` → aller à l'étape 8.

---

### Étape 4 : La campagne a été annulée

**Description :** Identifier qui ou quoi a annulé la campagne.

**Actions :**

1. Consulter `[PLACEHOLDER — historique des actions sur la campagne]`.
2. Vérifier si l'annulation est :
   - **Manuelle** (action d'un utilisateur) → informer le client, identifier l'utilisateur responsable.
   - **Automatique** (règle métier, chevauchement de segment) → expliquer la règle au client.
   - **Suite à une erreur** → aller à l'étape 3.

**Résultat attendu :** Comprendre l'origine de l'annulation pour prévenir une récidive.

---

### Étape 5 : Le segment est vide ou sous-dimensionné

**Description :** La campagne n'a pas été envoyée faute de destinataires.

**Actions :**

1. Vérifier la définition du segment dans `[PLACEHOLDER — module Segmentation]`.
2. Vérifier les filtres appliqués (dates de séjour, langue, statut client…).
3. Tester le segment en mode aperçu pour afficher le nombre de contacts.
4. Si le segment est vide :
   - Vérifier que les données client sont bien synchronisées depuis le PMS.
   - Vérifier la période de séjour ciblée (est-elle dans le futur / passé selon le type de campagne ?).
5. Ajuster les filtres si nécessaire et guider le client.

> **Note :** Une campagne pre-stay ciblant des séjours passés enverra 0 email — erreur de configuration fréquente.

**Résultat attendu :** Segment valide, campagne peut être relancée.

---

### Étape 6 : Quota d'envoi dépassé

**Description :** L'établissement a atteint la limite d'envois de sa formule.

**Actions :**

1. Vérifier le quota consommé vs. quota alloué dans `[PLACEHOLDER — tableau de bord consommation]`.
2. Informer le client du quota restant.
3. `[PLACEHOLDER — procédure d'augmentation de quota : contacter CSM / générer bon de commande]`.
4. Si urgence client → `[PLACEHOLDER — procédure d'exception / déblocage temporaire]`.

**Résultat attendu :** Client informé, quota augmenté ou campagne reportée.

---

### Étape 7 : Problème de configuration de l'expéditeur (domaine, DNS)

**Description :** L'adresse expéditrice n'est pas validée ou le domaine n'est pas configuré.

**Actions :**

1. Vérifier dans `[PLACEHOLDER — paramètres de l'expéditeur]` que l'adresse email est validée.
2. Vérifier la configuration DNS (SPF, DKIM) via `[PLACEHOLDER — outil de vérification DNS interne ou externe]` :
   - SPF : `[PLACEHOLDER — valeur attendue]`
   - DKIM : `[PLACEHOLDER — valeur attendue]`
3. Si DNS manquant ou incorrect :
   - Fournir au client les enregistrements DNS à ajouter chez son hébergeur.
   - Délai de propagation DNS : jusqu'à 48h.
4. Si DNS correct mais erreur persistante → escalader (voir section Escalade).

**Résultat attendu :** Expéditeur validé, campagne peut être relancée.

---

### Étape 8 : Erreur technique générique

**Description :** L'erreur n'est pas identifiable via les outils L1.

**Actions :**

1. Relever le code ou message d'erreur exact.
2. Vérifier `[PLACEHOLDER — page de statut / incidents plateforme]` pour un incident en cours.
3. Si incident connu → informer le client et communiquer l'ETA de résolution.
4. Si pas d'incident connu → escalader avec tous les éléments (voir section Escalade).

---

## Problèmes fréquents et résolutions

| Problème | Cause probable | Résolution |
|---|---|---|
| Campagne en brouillon | Client n'a pas confirmé l'envoi | Guider le client — étape 1 |
| Segment vide | Mauvais filtres ou données PMS non sync | Étape 5 |
| Quota dépassé | Volume d'envoi élevé | Étape 6 |
| Domaine expéditeur non validé | DNS manquant ou récent | Étape 7 |
| Campagne annulée automatiquement | Règle métier (doublon, chevauchement) | Étape 4 |
| Campagne envoyée, 0 réception | Problème de délivrabilité | Procédure *Délivrabilité email* |
| Pre-stay envoyée à 0 contacts | Date de séjour passée dans le filtre | Étape 5 |

---

## Escalade

**Escalader à `[PLACEHOLDER — L2 / équipe technique]` quand :**

- Erreur technique non identifiée dans les logs L1.
- La campagne est bloquée en file d'envoi depuis plus de `[PLACEHOLDER — délai seuil]`.
- L'anomalie touche plusieurs clients simultanément.
- DNS correct mais expéditeur toujours rejeté.

**Informations à inclure dans l'escalade :**

- Nom et ID de la campagne `[PLACEHOLDER — comment trouver l'ID]`
- Nom et ID de l'établissement
- Type de campagne (manuelle, automatique, newsletter)
- Statut affiché dans la plateforme
- Message d'erreur exact (capture d'écran)
- Nombre de contacts dans le segment
- Étapes déjà effectuées

---

## Points d'attention

- Toujours distinguer "non envoyée" (problème plateforme) de "non reçue" (problème délivrabilité) dès la qualification du ticket — le diagnostic est entièrement différent.
- Ne jamais relancer une campagne sans avoir compris pourquoi la première tentative a échoué — risque de doublon d'envoi.
- Pour les campagnes automatiques (pre-stay, post-stay), vérifier systématiquement la logique de déclenchement et la plage de dates du segment.
- Ne pas communiquer les logs internes au client.

_Dernière mise à jour : [DATE]_
