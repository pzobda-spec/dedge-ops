-- Sprint 1: Seed data matching lib/mockData.ts
-- Run after schema.sql

-- Clients
INSERT INTO clients (id, name, segment, country, language, products) VALUES
  ('c1', 'Hôtel Lutetia Paris', 'Strategic', 'France', 'FR', ARRAY['CRM Core', 'Guest Profile', 'Campaigns']),
  ('c2', 'Grand Hôtel Bordeaux', 'Strategic', 'France', 'FR', ARRAY['CRM Core', 'Guest Profile', 'WhatsApp']),
  ('c3', 'Mercure Lyon Centre', 'Gold', 'France', 'FR', ARRAY['CRM Core', 'Campaigns']),
  ('c4', 'Novotel Paris Bercy', 'Gold', 'France', 'FR', ARRAY['CRM Core', 'PMS', 'Guest App']),
  ('c5', 'Pullman Marseille', 'Gold', 'France', 'EN', ARRAY['CRM Core', 'Guest Profile']),
  ('c6', 'Ibis Strasbourg', 'Silver', 'France', 'FR', ARRAY['CRM Core']),
  ('c7', 'Best Western Rennes', 'Silver', 'France', 'FR', ARRAY['CRM Core', 'Campaigns']),
  ('c8', 'Campanile Nantes', 'Silver', 'France', 'FR', ARRAY['CRM Core']),
  ('c9', 'Formula 1 Dijon', 'Bronze', 'France', 'FR', ARRAY['CRM Core']),
  ('c10', 'Etap Hotel Lille', 'Bronze', 'France', 'FR', ARRAY['CRM Core'])
ON CONFLICT (id) DO NOTHING;

-- Sample Tickets (first 5)
INSERT INTO tickets (id, external_id, client_id, subject, status, priority, type, product_area, source, sentiment, risk_score, summary, recommended_action, last_client_message_at, last_agent_reply_at, created_at, updated_at) VALUES
  ('t1', 'ZD-1001', 'c1', 'Campagnes email non envoyées depuis 3 jours', 'open', 'urgent', 'problem', 'Campaigns', 'email', 'negative', 100,
   'Le client signale que ses campagnes email ne partent plus depuis 3 jours malgré un statut "Envoyé" dans l''interface.',
   'Vérifier les logs d''envoi SMTP, escalader en urgence à l''équipe technique.',
   '2026-05-17T10:00:00Z', '2026-05-15T08:00:00Z', '2026-05-14T08:00:00Z', '2026-05-17T10:00:00Z'),

  ('t2', 'ZD-1002', 'c1', 'Profils clients dupliqués dans Guest Profile', 'open', 'high', 'problem', 'Guest Profile', 'email', 'negative', 95,
   'Des doublons de profils clients apparaissent après la dernière synchronisation PMS.',
   'Analyser les logs de synchronisation PMS, préparer un script de déduplication.',
   '2026-05-16T09:00:00Z', '2026-05-16T09:00:00Z', '2026-05-13T09:00:00Z', '2026-05-16T09:00:00Z'),

  ('t3', 'ZD-1003', 'c2', 'WhatsApp Business : messages non délivrés aux clients', 'open', 'urgent', 'problem', 'WhatsApp', 'phone', 'negative', 100,
   'Le canal WhatsApp du client ne délivre plus les messages de pré-arrivée depuis hier soir.',
   'Vérifier le statut de l''API WhatsApp Business, escalader si token expiré.',
   '2026-05-17T08:00:00Z', '2026-05-16T20:00:00Z', '2026-05-15T14:00:00Z', '2026-05-17T08:00:00Z'),

  ('t4', 'ZD-1004', 'c2', 'Comment segmenter les clients VIP dans CRM Core ?', 'pending', 'high', 'question', 'CRM Core', 'chat', 'neutral', 75,
   'Le client souhaite mettre en place une segmentation avancée pour ses clients VIP.',
   'Préparer un guide de segmentation, proposer un appel de démonstration.',
   '2026-05-15T17:00:00Z', '2026-05-16T08:00:00Z', '2026-05-12T11:00:00Z', '2026-05-15T17:00:00Z'),

  ('t5', 'ZD-1005', 'c3', 'Erreur 500 lors de l''export des contacts', 'open', 'urgent', 'problem', 'CRM Core', 'email', 'negative', 85,
   'Le client obtient une erreur 500 à chaque tentative d''export de la liste de contacts.',
   'Reproduire l''erreur en environnement de test, vérifier les logs serveur.',
   '2026-05-17T15:00:00Z', '2026-05-17T10:00:00Z', '2026-05-16T10:00:00Z', '2026-05-17T15:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Sample Escalations
INSERT INTO escalations (id, ticket_id, linear_issue_id, status, subject, technical_summary, expected_behavior, actual_behavior, reproduction_steps, impact, next_action, owner, created_at, updated_at) VALUES
  ('e1', 't1', 'LIN-4521', 'in_progress',
   'Campagnes email : blocage SMTP côté serveur d''envoi',
   'Les campagnes affichent le statut "Envoyé" mais les logs SMTP montrent des timeouts répétés côté MTA.',
   'Les emails partent dans les 15 minutes suivant le déclenchement de la campagne.',
   'Les emails restent bloqués dans la queue d''envoi sans message d''erreur visible.',
   '1. Créer une campagne test\n2. La programmer pour envoi immédiat\n3. Observer la queue SMTP',
   'Client ne peut pas envoyer de campagnes depuis 3 jours.',
   'Vérifier la réputation IP, contacter le fournisseur SMTP si liste noire confirmée.',
   'Équipe Infrastructure', '2026-05-15T10:00:00Z', '2026-05-17T14:00:00Z'),

  ('e2', 't3', 'LIN-4522', 'sent',
   'WhatsApp Business API : token d''accès expiré',
   'Le token d''accès WhatsApp Business API du client a expiré et le renouvellement automatique a échoué.',
   'Les messages WhatsApp sont délivrés aux clients dans les 30 secondes.',
   'Les messages retournent une erreur 401 au niveau du webhook.',
   '1. Déclencher l''envoi d''un message WhatsApp\n2. Consulter les logs du webhook\n3. Observer l''erreur 401',
   'Tous les messages de pré-arrivée WhatsApp sont bloqués.',
   'Renouveler le token manuellement.',
   'Équipe Intégrations', '2026-05-16T15:00:00Z', '2026-05-17T09:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Monthly metrics (May 2026)
INSERT INTO monthly_metrics (month, year, total_tickets, total_calls, total_chats, avg_first_response_hours, fcr_rate, top_products, by_channel, opened_vs_resolved) VALUES
  (5, 2026, 287, 43, 124, 3.2, 0.68,
   '[{"name":"CRM Core","count":98},{"name":"Campaigns","count":76},{"name":"Guest Profile","count":54}]'::jsonb,
   '{"tickets":287,"calls":43,"chats":124}'::jsonb,
   '{"opened":287,"resolved":241}'::jsonb),

  (4, 2026, 263, 51, 109, 4.1, 0.71,
   '[{"name":"CRM Core","count":89},{"name":"Campaigns","count":68},{"name":"Guest Profile","count":47}]'::jsonb,
   '{"tickets":263,"calls":51,"chats":109}'::jsonb,
   '{"opened":263,"resolved":248}'::jsonb)
ON CONFLICT (month, year) DO NOTHING;
