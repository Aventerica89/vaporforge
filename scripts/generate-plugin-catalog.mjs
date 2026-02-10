#!/usr/bin/env node

/**
 * Generate a static plugin catalog from GitHub repos.
 * Uses the Trees API (1 call per repo) to avoid rate limits.
 * Optionally fetches plugin.json for descriptions (best-effort).
 *
 * Adapted from claude-codex/landing/scripts/generate-plugin-catalog.mjs
 * Output: ui/src/lib/generated/plugin-catalog.ts
 *
 * Usage: node scripts/generate-plugin-catalog.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const OUT_DIR = path.resolve(
  import.meta.dirname,
  '..',
  'ui',
  'src',
  'lib',
  'generated'
)

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SOURCES = [
  {
    id: 'anthropic-official',
    owner: 'anthropics',
    repo: 'claude-plugins-official',
    branch: 'main',
    prefixes: ['plugins/', 'external_plugins/'],
  },
  {
    id: 'awesome-community',
    owner: 'ccplugins',
    repo: 'awesome-claude-code-plugins',
    branch: 'main',
    prefixes: ['plugins/'],
  },
]

const COMPONENT_DIRS = ['agents', 'commands', 'skills', 'rules']

const CATEGORY_MAP = {
  'code-review': 'Code Quality',
  'code-simplifier': 'Code Quality',
  'pr-review-toolkit': 'Code Quality',
  'security-guidance': 'Security',
  'commit-commands': 'Git',
  'hookify': 'Automation',
  'plugin-dev': 'Development',
  'agent-sdk-dev': 'Development',
  'claude-code-setup': 'Setup',
  'claude-md-management': 'Configuration',
  'feature-dev': 'Development',
  'frontend-design': 'Frontend',
  'playground': 'Development',
  'ralph-loop': 'Automation',
  'learning-output-style': 'Configuration',
  'explanatory-output-style': 'Configuration',
  'bug-fix': 'Debugging',
  'bug-detective': 'Debugging',
  'audit': 'Code Quality',
  'changelog-generator': 'Documentation',
}

// Plugins that require MCP relay (non-markdown-only)
const RELAY_REQUIRED_PLUGINS = new Set([
  // Plugins with MCP server integrations that need local relay
])

const LSP_SUFFIX = '-lsp'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

async function fetchJSON(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`)
  }
  return response.json()
}

async function fetchText(url) {
  const response = await fetch(url)
  if (!response.ok) return null
  return response.text()
}

function escapeForTS(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/'/g, "\\'")
}

function slugify(name) {
  return name
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function inferCategories(pluginName, manifest) {
  const categories = []

  if (manifest?.categories && Array.isArray(manifest.categories)) {
    return manifest.categories
  }

  if (CATEGORY_MAP[pluginName]) {
    categories.push(CATEGORY_MAP[pluginName])
  }

  if (pluginName.endsWith(LSP_SUFFIX)) {
    categories.push('Language Server')
    const lang = pluginName.replace(LSP_SUFFIX, '')
    categories.push(lang.charAt(0).toUpperCase() + lang.slice(1))
  }

  if (manifest?.keywords) {
    for (const kw of manifest.keywords) {
      const kwLower = kw.toLowerCase()
      if (kwLower.includes('security')) categories.push('Security')
      if (kwLower.includes('test')) categories.push('Testing')
      if (kwLower.includes('deploy')) categories.push('Deployment')
      if (kwLower.includes('ai') || kwLower.includes('ml')) categories.push('AI/ML')
    }
  }

  if (categories.length === 0) {
    categories.push('General')
  }

  return [...new Set(categories)]
}

function inferCompatibility(pluginName, manifest) {
  // Plugins with MCP servers that need local connections = relay-required
  if (RELAY_REQUIRED_PLUGINS.has(pluginName)) return 'relay-required'
  if (manifest?.mcpServers && manifest.mcpServers.length > 0) return 'relay-required'
  // Most plugins are markdown-only (agents/commands/rules) = cloud-ready
  return 'cloud-ready'
}

// ---------------------------------------------------------------------------
// Tree parsing
// ---------------------------------------------------------------------------

function parseTreeForPlugins(tree, prefixes, sourceId) {
  const pluginMap = new Map()

  for (const entry of tree) {
    const entryPath = entry.path

    for (const prefix of prefixes) {
      if (!entryPath.startsWith(prefix)) continue

      const rest = entryPath.slice(prefix.length)
      const parts = rest.split('/')
      if (parts.length < 2) continue

      const pluginName = parts[0]
      const pluginKey = `${sourceId}:${pluginName}`

      if (!pluginMap.has(pluginKey)) {
        pluginMap.set(pluginKey, {
          name: pluginName,
          prefix,
          components: [],
          hasPluginJson: false,
          hasReadme: false,
        })
      }

      const pluginInfo = pluginMap.get(pluginKey)
      const subPath = parts.slice(1).join('/')

      if (subPath === '.claude-plugin/plugin.json') {
        pluginInfo.hasPluginJson = true
      }

      if (subPath === 'README.md') {
        pluginInfo.hasReadme = true
      }

      for (const dir of COMPONENT_DIRS) {
        if (parts[1] === dir && parts.length >= 3) {
          const fileName = parts[parts.length - 1]
          if (entry.type === 'blob' && fileName.endsWith('.md')) {
            const compName = fileName.replace('.md', '')
            pluginInfo.components.push({
              type: dir.replace(/s$/, ''),
              name: compName,
              slug: slugify(compName),
            })
          }
          if (parts.length >= 4 && parts[2] !== fileName && fileName === 'SKILL.md') {
            const compName = parts[2]
            const exists = pluginInfo.components.some(
              (c) => c.type === 'skill' && c.name === compName
            )
            if (!exists) {
              pluginInfo.components.push({
                type: 'skill',
                name: compName,
                slug: slugify(compName),
              })
            }
          }
        }
      }
    }
  }

  return pluginMap
}

// ---------------------------------------------------------------------------
// Manifest fetching (best-effort, parallel)
// ---------------------------------------------------------------------------

async function fetchManifests(pluginMap, sourceConfig) {
  const { owner, repo, branch } = sourceConfig
  const baseRaw = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`

  const fetches = []

  for (const [key, info] of pluginMap.entries()) {
    if (!info.hasPluginJson) continue

    const url = `${baseRaw}/${info.prefix}${info.name}/.claude-plugin/plugin.json`
    fetches.push(
      fetchText(url)
        .then((text) => {
          if (text) {
            try {
              return { key, manifest: JSON.parse(text) }
            } catch {
              return { key, manifest: null }
            }
          }
          return { key, manifest: null }
        })
        .catch(() => ({ key, manifest: null }))
    )
  }

  const results = new Map()
  const BATCH_SIZE = 10

  for (let i = 0; i < fetches.length; i += BATCH_SIZE) {
    const batch = fetches.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(batch)
    for (const { key, manifest } of batchResults) {
      if (manifest) results.set(key, manifest)
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Build catalog
// ---------------------------------------------------------------------------

function truncateDescription(desc) {
  if (!desc) return null
  const cleaned = desc
    .replace(/\\n/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const firstSentence = cleaned.match(/^[^.!?]+[.!?]/)
  if (firstSentence && firstSentence[0].length <= 200) {
    return firstSentence[0].trim()
  }
  if (cleaned.length <= 200) return cleaned
  return cleaned.slice(0, 197) + '...'
}

async function buildCatalogForSource(sourceConfig) {
  const { id, owner, repo, branch, prefixes } = sourceConfig
  const repoUrl = `https://github.com/${owner}/${repo}`

  console.log(`  Fetching tree for ${owner}/${repo}...`)
  const treeData = await fetchJSON(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
  )

  if (!treeData.tree) {
    throw new Error(`No tree data for ${owner}/${repo}`)
  }

  console.log(`    ${treeData.tree.length} entries in tree`)

  const pluginMap = parseTreeForPlugins(treeData.tree, prefixes, id)
  console.log(`    ${pluginMap.size} plugins found`)

  console.log(`    Fetching plugin.json manifests...`)
  const manifests = await fetchManifests(pluginMap, sourceConfig)
  console.log(`    ${manifests.size} manifests loaded`)

  const plugins = []

  for (const [key, info] of pluginMap.entries()) {
    const manifest = manifests.get(key)
    const authorName = manifest?.author?.name || manifest?.author || null

    const agentCount = info.components.filter((c) => c.type === 'agent').length
    const skillCount = info.components.filter((c) => c.type === 'skill').length
    const commandCount = info.components.filter((c) => c.type === 'command').length
    const ruleCount = info.components.filter((c) => c.type === 'rule').length

    const totalComponents = agentCount + skillCount + commandCount + ruleCount
    if (totalComponents === 0 && !manifest?.description) continue

    const pluginSlug = slugify(info.name)
    const pluginPath = `${info.prefix}${info.name}`

    plugins.push({
      id: `${id}:${pluginSlug}`,
      source_id: id,
      name: manifest?.name || info.name,
      description: truncateDescription(manifest?.description) || null,
      author: typeof authorName === 'string' ? authorName : null,
      repository_url: `${repoUrl}/tree/${branch}/${pluginPath}`,
      categories: inferCategories(info.name, manifest),
      agent_count: agentCount,
      skill_count: skillCount,
      command_count: commandCount,
      rule_count: ruleCount,
      compatibility: inferCompatibility(info.name, manifest),
      components: info.components.map((c) => ({
        type: c.type,
        name: c.name,
        slug: c.slug,
      })),
    })
  }

  return plugins
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

function generateCatalogFile(allPlugins) {
  const header = [
    '// Auto-generated by scripts/generate-plugin-catalog.mjs',
    '// Do not edit manually',
    "import type { CatalogPlugin, CatalogStats } from './catalog-types'",
    '',
  ].join('\n')

  const pluginEntries = allPlugins.map((p) => {
    const components = p.components
      .map(
        (c) =>
          `{ type: '${c.type}', name: '${escapeForTS(c.name)}', slug: '${c.slug}' }`
      )
      .join(',\n      ')

    const cats = p.categories.map((c) => `'${escapeForTS(c)}'`).join(', ')
    const desc = p.description ? `'${escapeForTS(p.description)}'` : 'null'
    const author = p.author ? `'${escapeForTS(p.author)}'` : 'null'

    return `  {
    id: '${p.id}',
    source_id: '${p.source_id}',
    name: '${escapeForTS(p.name)}',
    description: ${desc},
    author: ${author},
    repository_url: '${p.repository_url}',
    categories: [${cats}],
    agent_count: ${p.agent_count},
    skill_count: ${p.skill_count},
    command_count: ${p.command_count},
    rule_count: ${p.rule_count},
    compatibility: '${p.compatibility}',
    components: [
      ${components}
    ],
  }`
  })

  const official = allPlugins.filter(
    (p) => p.source_id === 'anthropic-official'
  ).length
  const community = allPlugins.filter(
    (p) => p.source_id === 'awesome-community'
  ).length

  const stats = `
export const catalogStats: CatalogStats = {
  total: ${allPlugins.length},
  official: ${official},
  community: ${community},
  generatedAt: '${new Date().toISOString()}',
}
`

  return (
    header +
    '\nexport const catalog: CatalogPlugin[] = [\n' +
    pluginEntries.join(',\n') +
    '\n]\n' +
    stats
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Generating plugin catalog from GitHub repos...\n')

  const allPlugins = []

  for (const source of SOURCES) {
    try {
      const plugins = await buildCatalogForSource(source)
      allPlugins.push(...plugins)
      console.log(`    Added ${plugins.length} plugins from ${source.id}\n`)
    } catch (error) {
      console.error(`  ERROR: Failed to fetch ${source.id}:`, error.message)
    }
  }

  allPlugins.sort((a, b) => {
    if (a.source_id !== b.source_id) {
      return a.source_id === 'anthropic-official' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  console.log(`Total: ${allPlugins.length} plugins`)

  ensureDir(OUT_DIR)

  const content = generateCatalogFile(allPlugins)
  const outPath = path.join(OUT_DIR, 'plugin-catalog.ts')
  fs.writeFileSync(outPath, content, 'utf-8')

  const sizeKB = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1)
  console.log(`\nWrote ${outPath} (${sizeKB} KB)`)
  console.log('Done!')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
