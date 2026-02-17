# Agency Mode: AI-Powered Site Builder for JBMD Creations

**Date:** 2026-02-17
**Status:** Design (pending implementation plan)
**Author:** JB + Claude

## Problem

JBMD Creations runs a digital marketing agency (jbmdcreations.com, medsparanker.com) using WordPress + Bricks Builder. The workflow is precise but slow. AI can speed up site building, but natural language alone lacks the precision needed for pixel-perfect agency work. The solution must give **visual selection + scoped AI editing** — not "generate me a website."

## Architecture

### Stack
- **Framework:** Astro (static/SSR, fast, component-based)
- **CMS:** theBCMS (free tier to start, Payload CMS as fallback via abstraction layer)
- **AI Editor:** VaporForge "Agency Mode" (sandbox runs Astro dev, inspect overlay, scoped editing)
- **Dashboard:** WP Dispatch (manages both WP and Astro sites, links to VaporForge)
- **Forms:** CF Worker endpoint (one Worker handles all client forms)
- **Hosting:** Cloudflare Pages (free, unlimited sites, global CDN)
- **Booking:** Cal.com embed
- **Payments:** Stripe Checkout links

### System Diagram

```
WP Dispatch (Dashboard Hub)
├── WordPress Sites → managed via WP REST API
└── Astro Sites → "Open in VaporForge" link
        │
        ▼
VaporForge Agency Mode
├── Sandbox: Astro dev server (port 4321)
├── Preview: iframe with inspect overlay
├── Editor: component source + AI prompt + diff viewer
├── CMS: theBCMS API (content fetch at build time)
├── Component Library: pre-built agency components
└── Deploy: CF Pages via wrangler
```

## WordPress Feature Mapping

| WordPress | New Equivalent | Notes |
|-----------|----------------|-------|
| Custom Post Types | BCMS Templates | Define typed content structures (Service, Team, Testimonial) |
| ACF / Custom Fields | BCMS Properties | Text, rich text, media, number, enum, group fields |
| Contact Form 7 | CF Worker + Resend | One Worker handles all client forms, routes by domain |
| Blog / Posts | BCMS Blog template | Built-in with categories, rich text, media |
| Menus / Navigation | Astro component | Static or CMS-driven nav |
| SEO (Yoast) | Astro head + schema | SEO fields in CMS templates, rendered in layout |
| Image optimization | Astro Image | Built-in WebP/AVIF conversion |
| Page builder (Bricks) | Scoped AI Editor | Visual select + component-level AI editing |
| WooCommerce | Stripe Checkout / Snipcart | For sites that need e-commerce |
| Booking plugins | Cal.com embed | Embeddable scheduling widget |

## CMS Abstraction Layer

Both theBCMS and Payload expose REST APIs. A thin abstraction keeps the frontend CMS-agnostic:

```typescript
// src/lib/cms.ts
// Swap implementation to change CMS providers
// Astro pages import from here, never from CMS SDK directly

export async function getBlogPosts(): Promise<BlogPost[]> { ... }
export async function getServices(): Promise<Service[]> { ... }
export async function getTestimonials(): Promise<Testimonial[]> { ... }
export async function getTeamMembers(): Promise<TeamMember[]> { ... }
```

**Migration path:** Start with theBCMS free tier (100 entries, 2 seats). If a client outgrows it, swap to self-hosted Payload by changing cms.ts implementation. No component changes needed.

## Scoped AI Editor (Core Innovation)

### Problem It Solves
AI hallucination when editing entire pages. Natural language is imprecise for pixel-perfect design work.

### Solution: Visual Selection + Component Isolation

1. Site renders in an iframe (Astro dev server in sandbox)
2. Inspect overlay highlights component boundaries on hover
3. Click locks selection, opens component source in side panel
4. User describes change in natural language
5. AI receives ONLY that component file (20-80 lines)
6. AI returns a diff — user sees exact changes
7. Accept or reject. Astro HMR updates preview instantly.

### Technical Implementation

Components render with data attributes for the overlay:

```astro
<section data-vf-component="HeroSplit" data-vf-file="src/components/heroes/HeroSplit.astro">
  ...
</section>
```

The overlay script (injected into iframe) reads these attributes to map DOM elements to source files.

### Control Mechanisms
- AI sees only the selected component (20-80 lines), not the whole page
- Diff-based approval — nothing applies without explicit accept
- Components can be "frozen" (locked from AI editing)
- Client mode: changes require developer approval before deployment

## Component Library

Pre-built Astro components organized by section type:

```
components/
├── heroes/         (HeroCentered, HeroSplit, HeroVideo, HeroMinimal)
├── features/       (FeatureGrid, FeatureAlternating, FeatureTabs, FeatureIconList)
├── social-proof/   (TestimonialCarousel, TestimonialSingle, LogoCloud, StatsBar)
├── forms/          (ContactForm, NewsletterSignup, QuoteRequest)
├── pricing/        (PricingTable, PricingCards)
├── content/        (BlogGrid, BlogList, TeamGrid, FAQAccordion)
├── cta/            (CTABanner, CTAInline, CTASplit)
├── layout/         (Navbar, Footer, Sidebar, Breadcrumbs)
└── integrations/   (CalEmbed, StripeButton, MapEmbed)
```

Each component accepts typed props + inherits theme via CSS custom properties.

## Agency Workflow

### Phase 1: Discovery + Design
- Client provides brief
- AI generates 4 HTML playground mockups (different design directions)
- Client picks favorite
- Winning design's colors, fonts, spacing extracted as CSS custom properties (theme tokens)

### Phase 2: Build
- Scaffold project from agency starter template (pre-configured with BCMS, component library, ACSS utilities)
- Create CMS content types matching client needs
- Compose pages from component library
- Customize components with scoped AI editor

### Phase 3: Client Review
- Client reviews live preview via shared link
- Requests changes verbally or via scoped editor (with developer approval gate)

### Phase 4: Launch
- Build static site: `npm run build`
- Deploy to CF Pages: `npx wrangler pages deploy dist/`
- Point client domain via DNS
- Cost: $0/month hosting

### Phase 5: Ongoing Maintenance
- Content updates: client edits in BCMS admin panel (text, images, blog posts)
- Design changes: developer uses scoped AI editor in VaporForge
- New sections: developer composes from component library + customizes

## Contact Form Worker

One CF Worker handles forms for all client sites:

```
POST https://forms.jbcloud.app/{client-slug}
├── Validates input (Zod schema per client)
├── Sends email via Resend API
├── Writes lead to D1 database
└── Fires webhook (optional: Slack, HubSpot, etc.)
```

Free tier: 100K requests/day. Handles hundreds of client sites.

## Cost Analysis

### Per-Client Site Cost (Production)
| Item | Monthly Cost |
|------|-------------|
| CF Pages hosting | $0 (free, unlimited) |
| theBCMS (free tier) | $0 (100 entries per instance) |
| CF Worker (forms) | $0 (shared across all sites, free tier) |
| Domain | ~$1/mo (annual, varies) |
| **Total** | **~$1/month** |

### Compared to WordPress
| Item | WordPress Monthly |
|------|------------------|
| Hosting (Cloudways/WPEngine) | $15-30 |
| Theme/plugins licenses | $5-15 |
| Security/maintenance | $5-10 (time cost) |
| **Total** | **$25-55/month** |

### theBCMS Upgrade Path
If free tier (100 entries) runs out: Pro at $10/seat/mo (annual).
If cost becomes prohibitive: migrate to Payload CMS (free, self-hosted) by swapping cms.ts.

## WP Dispatch Integration

WP Dispatch remains the unified dashboard:
- Existing WP sites: managed via WP REST API (no changes)
- New Astro sites: displayed in dashboard with "Open in VaporForge" link
- Future: site status, deployment logs, form submission stats in one view

### Data Model Addition
```sql
-- In WP Dispatch's Turso database
ALTER TABLE applications ADD COLUMN site_type TEXT DEFAULT 'wordpress';
-- 'wordpress' | 'astro'
ALTER TABLE applications ADD COLUMN vaporforge_session_id TEXT;
-- Links to VaporForge sandbox for Astro sites
```

## Implementation Phases

### Phase 0: Foundation (Starter Template + CMS)
- Create Astro agency starter template with theBCMS integration
- Build cms.ts abstraction layer
- Create 3-4 core component categories (heroes, features, forms, layout)
- Set up CF Worker form handler

### Phase 1: Component Library
- Build full component library (all categories above)
- Theme system (CSS custom properties extracted from playground mockups)
- Responsive defaults for all components

### Phase 2: VaporForge Agency Mode
- "Agency Mode" toggle/view in VaporForge
- Sandbox runs Astro dev server
- Inspect overlay (component boundary highlighting + selection)
- Scoped AI editing (selected component only)
- Diff viewer + accept/reject

### Phase 3: WP Dispatch Link
- Add Astro site type to WP Dispatch
- "Open in VaporForge" deep links
- Deployment status tracking

### Phase 4: Client Editing
- Client-facing scoped editor (subset of Agency Mode)
- Approval gate (client changes need developer sign-off)
- Content-only mode (BCMS panel access, no code editing)

## Open Questions
- Should the component library be open-sourced / shared across agency projects?
- Should playground-to-theme extraction be automated (AI reads mockup, generates CSS custom properties)?
- What level of client AI editing access is safe without developer approval?

## Success Criteria
- Build a complete client site (5-10 pages) in under 4 hours
- Client can update content without calling developer
- Zero hosting cost per site (CF Pages free tier)
- No AI hallucination — scoped editing only touches selected components
- Smooth migration path from WordPress (incremental, not all-at-once)
