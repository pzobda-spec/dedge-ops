-- Read-only Todoist cache.

CREATE TABLE IF NOT EXISTS todoist_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  zoho_project_id TEXT,
  last_synced_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_todoist_projects_zoho_project_id
  ON todoist_projects(zoho_project_id);

CREATE TABLE IF NOT EXISTS todoist_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES todoist_projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL,
  author TEXT,
  raw JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_todoist_comments_project_posted_at
  ON todoist_comments(project_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_todoist_comments_task_id
  ON todoist_comments(task_id);
