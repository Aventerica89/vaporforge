// Catalog plugin type — auto-generated plugins from GitHub repos
// Used by the marketplace UI for browsing and installing

export interface CatalogPlugin {
  id: string
  source_id: string
  name: string
  description: string | null
  author: string | null
  repository_url: string
  categories: string[]
  agent_count: number
  skill_count: number
  command_count: number
  rule_count: number
  compatibility: 'cloud-ready' | 'relay-required'
  components: Array<{ type: string; name: string; slug: string }>
}

export interface CatalogStats {
  total: number
  official: number
  community: number
  generatedAt: string
}
