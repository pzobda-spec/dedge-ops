-- Cache Todoist tasks so hotel projects can be matched below shared containers.

CREATE TABLE IF NOT EXISTS todoist_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES todoist_projects(id) ON DELETE CASCADE,
  parent_id TEXT,
  content TEXT NOT NULL,
  zoho_project_id TEXT,
  raw JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_todoist_tasks_project_id
  ON todoist_tasks(project_id);

CREATE INDEX IF NOT EXISTS idx_todoist_tasks_parent_id
  ON todoist_tasks(parent_id);

CREATE INDEX IF NOT EXISTS idx_todoist_tasks_zoho_project_id
  ON todoist_tasks(zoho_project_id);
