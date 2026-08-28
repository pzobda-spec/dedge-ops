# Support case : Accès & Authentification

## Introduction

**Description du problème :** Un utilisateur d'un établissement client ne peut pas accéder à la plateforme D-EDGE CRM. Le problème peut venir d'un compte inexistant, désactivé, mal configuré, d'un problème de 2FA, ou d'un accès multi-propriété insuffisant.

**Contexte d'utilisation :** Utiliser cette procédure pour tout ticket signalant une impossibilité de connexion, un compte manquant, ou des droits insuffisants sur un ou plusieurs établissements.

---

## Prérequis

### Informations à collecter auprès du client

- Adresse email utilisée pour se connecter
- Nom de l'établissement (et groupe si multi-propriété)
- Module concerné (Guest App, Hub, Dmbook Pro, Kiosque…)
- Message d'erreur exact ou comportement observé
- Date et heure de la première occurrence

### Outils nécessaires

- `[PLACEHOLDER — panneau d'administration LoungeUp : chemin d'accès]`
- `[PLACEHOLDER — outil de gestion des utilisateurs : nom + URL]`
- `[PLACEHOLDER — logs d'authentification / journal de connexion : nom + accès]`
- Zoho Desk (ticket client)

---

## Processus de diagnostic

### Étape 1 : Vérifier l'existence du compte

**Description :** Confirmer que l'adresse email correspond à un compte actif.

**Actions :**

1. Aller dans `[PLACEHOLDER — menu Utilisateurs]`.
2. Rechercher l'adresse email communiquée par le client.
3. Vérifier le statut du compte :
   - Si le compte **n'existe pas** → aller à l'étape 2.
   - Si le compte existe mais est **désactivé** → aller à l'étape 3.
   - Si le compte est **actif** → aller à l'étape 4.

**Résultat attendu :** Identifier si le problème est lié à l'existence ou au statut du compte.

---

### Étape 2 : Créer le compte utilisateur

**Description :** Le compte n'existe pas — le créer ou guider le client.

**Actions :**

1. Vérifier que la demande est légitime (coordonnées de l'établissement, rôle demandé).
2. Dans `[PLACEHOLDER — menu Créer un utilisateur]` :
   - Renseigner l'adresse email.
   - Assigner le rôle approprié : `[PLACEHOLDER — liste des rôles disponibles]`.
   - Associer à l'établissement concerné.
3. `[PLACEHOLDER — déclencher l'invitation / le lien de connexion initial]`.
4. Informer le client qu'un email d'accès a été envoyé.

> **Note :** Vérifier que l'adresse email du client n'est pas bloquée par un filtre anti-spam avant de créer le compte.

**Résultat attendu :** Compte créé, email d'invitation envoyé.

---

### Étape 3 : Réactiver un compte désactivé

**Description :** Le compte existe mais a été désactivé.

**Actions :**

1. Identifier la raison de la désactivation dans `[PLACEHOLDER — journal / historique du compte]`.
2. Si désactivation volontaire (départ d'employé) → demander validation du responsable côté client avant réactivation.
3. Si désactivation technique → réactiver directement.
4. `[PLACEHOLDER — procédure de réactivation : bouton / action]`.
5. Vérifier que l'accès est rétabli et informer le client.

**Résultat attendu :** Compte réactivé, connexion possible.

---

### Étape 4 : Diagnostiquer un problème de connexion sur compte actif

**Description :** Le compte existe et est actif, mais la connexion échoue.

**Actions :**

1. Demander au client quel message d'erreur s'affiche :
   - `[PLACEHOLDER — message d'erreur "identifiants incorrects"]` → aller à l'étape 5.
   - `[PLACEHOLDER — message d'erreur "code expiré / lien invalide"]` → aller à l'étape 5.
   - `[PLACEHOLDER — message d'erreur 2FA]` → aller à l'étape 6.
   - `[PLACEHOLDER — message d'erreur "accès refusé / droits insuffisants"]` → aller à l'étape 7.
   - Pas de message, page blanche ou chargement infini → aller à l'étape 8.

---

### Étape 5 : Réinitialiser l'accès (lien / mot de passe)

**Description :** Le client ne reçoit pas ou ne peut pas utiliser son lien de connexion.

**Actions :**

1. Vérifier que l'adresse email est correcte dans le compte (faute de frappe fréquente).
2. `[PLACEHOLDER — régénérer un lien de connexion / réinitialiser le mot de passe]`.
3. Demander au client de vérifier ses spams.
4. Si le lien n'arrive toujours pas :
   - Vérifier les logs d'envoi dans `[PLACEHOLDER — outil de logs email]`.
   - Si erreur de délivrabilité → voir procédure *Email delivery*.
5. Informer le client que le lien est valable `[PLACEHOLDER — durée de validité]`.

**Résultat attendu :** Client reçoit et utilise le lien de connexion.

---

### Étape 6 : Résoudre un problème de 2FA

**Description :** Le client ne reçoit pas ou ne peut pas valider son code de double authentification.

**Actions :**

1. Vérifier dans `[PLACEHOLDER]` que la 2FA est bien configurée sur le compte.
2. Vérifier le numéro de téléphone ou l'adresse email de réception du code.
3. Si mauvais numéro/adresse → corriger et renvoyer le code.
4. `[PLACEHOLDER — procédure de désactivation temporaire de la 2FA si bloquant]`.
5. Si le problème persiste → escalader (voir section Escalade).

**Résultat attendu :** Client accède avec son code 2FA.

---

### Étape 7 : Corriger les droits d'accès (multi-propriété)

**Description :** Le client accède à la plateforme mais ne voit pas un ou plusieurs établissements.

**Actions :**

1. Vérifier dans `[PLACEHOLDER — gestion des accès]` quels établissements sont associés au compte.
2. Identifier l'établissement manquant.
3. Vérifier si l'établissement est bien actif dans `[PLACEHOLDER]`.
4. `[PLACEHOLDER — ajouter l'établissement au compte utilisateur]`.
5. Demander au client de se déconnecter et reconnecter.

**Résultat attendu :** L'utilisateur voit tous les établissements attendus.

---

### Étape 8 : Problème technique (page blanche, chargement infini)

**Description :** La connexion semble aboutir mais la page ne charge pas.

**Actions :**

1. Demander au client de tester sur un autre navigateur et en navigation privée.
2. Vérifier si le problème est isolé (un seul utilisateur) ou généralisé (plusieurs clients).
3. Si généralisé → vérifier `[PLACEHOLDER — page de statut / incidents D-EDGE]`.
4. Si isolé → demander les informations de navigateur et OS, escalader avec capture d'écran.

---

## Problèmes fréquents et résolutions

| Problème | Cause probable | Résolution |
|---|---|---|
| Lien de connexion non reçu | Filtre anti-spam ou adresse email incorrecte | Étape 5 |
| Code 2FA non reçu | Numéro ou adresse de réception incorrecte | Étape 6 |
| "Accès refusé" sur un établissement | Droits non attribués | Étape 7 |
| Compte introuvable | Jamais créé ou email différent | Étape 2 |
| Compte désactivé | Départ d'employé ou action admin | Étape 3 |
| Page ne charge pas | Cache navigateur ou incident plateforme | Étape 8 |

---

## Escalade

**Escalader à `[PLACEHOLDER — L2 / équipe technique]` quand :**

- La 2FA est définitivement bloquée et ne peut pas être désactivée en L1.
- Le compte est actif, le lien est envoyé, mais la connexion échoue systématiquement.
- Le problème touche plusieurs clients simultanément (incident potentiel).
- Les logs montrent une erreur technique inexpliquée.

**Informations à inclure dans l'escalade :**

- Adresse email du compte
- Nom de l'établissement et ID `[PLACEHOLDER]`
- Module concerné
- Message d'erreur exact (capture d'écran)
- Étapes déjà effectuées
- Horodatage des tentatives

---

## Points d'attention

- Ne jamais créer un compte sans vérifier l'identité du demandeur.
- Un lien de connexion expiré ne signifie pas un problème technique — vérifier la durée de validité avant tout diagnostic.
- Pour les comptes multi-propriété de grands groupes, la modification des droits peut nécessiter validation managériale `[PLACEHOLDER — processus interne]`.
- Ne pas communiquer les logs internes au client.

_Dernière mise à jour : [DATE]_
