-- Lot 0.3 du plan d'exécution : démarrer les snapshots quotidiens.
--
-- Sans historique, ni rétention, ni tendance, ni délai réel ne sont calculables.
-- `onboarding_workload_snapshots` existe depuis la migration 026 et n'a jamais
-- été alimentée : chaque jour écoulé est une journée définitivement perdue.
--
-- Cette migration ajoute la table de portefeuille CSM, et rend le pourcentage
-- de charge OB reproductible en stockant le plafond qui a servi à le calculer.

-- 1. Snapshot quotidien du portefeuille CSM.
CREATE TABLE IF NOT EXISTS csm_portfolio_snapshots (
  snapshot_date DATE NOT NULL,
  csm_name TEXT NOT NULL,
  -- Comptes au statut Client rattachés à ce CSM.
  client_accounts INTEGER NOT NULL,
  -- Sous-ensemble ayant au moins un projet en statut Live.
  live_accounts INTEGER NOT NULL,
  -- MRR des seuls comptes valorisés, c'est-à-dire à MRR non nul.
  valued_mrr NUMERIC(12,2) NOT NULL,
  -- Nombre de comptes valorisés. Sans ce dénominateur, la couverture du MRR
  -- (45,5 % du parc au 6 septembre 2026) ne serait pas reconstituable a
  -- posteriori, et le montant historique serait illisible.
  valued_accounts INTEGER NOT NULL,
  -- Comptes au statut Former client rattachés à ce CSM, cumul à la date.
  churned_accounts_cumulative INTEGER NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (snapshot_date, csm_name)
);

ALTER TABLE csm_portfolio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_csm_portfolio_snapshots_csm_date
  ON csm_portfolio_snapshots(csm_name, snapshot_date DESC);

-- 2. Rendre le pourcentage de charge OB reproductible.
--
-- `charge_pct` était stocké sans son dénominateur. Le plafond réel est
-- désormais propre à chaque implémenteur (`ob_capacity_rules.max_projects`,
-- pondéré par sa disponibilité) et non plus la constante globale de 50. Sans
-- la valeur utilisée au moment du calcul, un pourcentage historique devient
-- non auditable dès qu'un plafond change.
ALTER TABLE onboarding_workload_snapshots
  ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 50;

COMMENT ON COLUMN onboarding_workload_snapshots.capacity IS
  'Plafond de projets simultanés retenu pour calculer charge_pct à cette date.';

-- `charge_pct` devient nullable : un implémenteur absent ou en stop a une
-- capacité effective nulle. Le pourcentage n'est alors pas calculable, alors
-- que sa charge peut être non nulle si des dossiers ne lui ont pas été retirés.
-- Stocker 0 masquerait cette surcharge, et un pourcentage sentinelle mentirait.
-- NULL veut dire « non calculable » ; `active_projects` et `capacity` portent
-- la vérité, et la lecture doit signaler ce cas comme une surcharge.
ALTER TABLE onboarding_workload_snapshots
  ALTER COLUMN charge_pct DROP NOT NULL;

-- 3. Note sur le périmètre de `active_projects`.
--
-- Depuis l'arbitrage A1, un projet actif exclut les dossiers en pause
-- (blocked, pending_client, standby) en plus des dossiers terminés ou hors
-- périmètre. Les lignes écrites avant cet arbitrage n'existent pas : la table
-- était vide, il n'y a donc aucune rupture de série à documenter.
COMMENT ON COLUMN onboarding_workload_snapshots.active_projects IS
  'Projets réellement portés : hors live, other, blocked, pending_client, standby.';
