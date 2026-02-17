# Agency Mode Phase 0: Foundation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the agency-starter Astro template with theBCMS integration, CMS abstraction layer, core component library, theme system, and CF Worker form handler.

**Architecture:** Two new repos: (1) `agency-starter` — an Astro project template with theBCMS, component library, and CSS custom property theme system. (2) `forms-worker` — a shared CF Worker that handles contact form submissions for all client sites, routes by slug, validates with Zod, sends email via Resend. The starter template is what gets cloned per client site. Agency Mode UI (Phase 2) will live in the VaporForge repo.

**Tech Stack:** Astro 5, theBCMS client SDK, TypeScript, Tailwind CSS v4, Vitest, Cloudflare Workers (Hono), Resend (email), Zod (validation)

---

## Task 1: Scaffold agency-starter Repo

**Files:**
- Create: `~/agency-starter/package.json`
- Create: `~/agency-starter/astro.config.mjs`
- Create: `~/agency-starter/tsconfig.json`
- Create: `~/agency-starter/tailwind.config.mjs`
- Create: `~/agency-starter/.env.example`
- Create: `~/agency-starter/.gitignore`

**Step 1: Create repo and scaffold Astro project**

```bash
cd ~
npm create astro@latest agency-starter -- --template minimal --typescript strict --install --git
cd ~/agency-starter
```

**Step 2: Install core dependencies**

```bash
npm install @thebcms/client tailwindcss @astrojs/tailwind
npm install -D vitest @testing-library/dom happy-dom
```

**Step 3: Configure Astro with Tailwind**

Update `astro.config.mjs`:

```javascript
import { defineConfig } from 'astro/config'
import tailwind from '@astrojs/tailwind'

export default defineConfig({
  integrations: [tailwind()],
  output: 'static',
})
```

**Step 4: Create .env.example with BCMS placeholders**

```bash
# theBCMS Configuration
BCMS_ORG_ID=your-org-id
BCMS_INSTANCE_ID=your-instance-id
BCMS_API_KEY_ID=your-api-key-id
BCMS_API_KEY_SECRET=your-api-key-secret

# Form Handler
FORMS_WORKER_URL=https://forms.jbcloud.app

# Site Config
SITE_NAME=Client Site
SITE_URL=https://example.com
```

**Step 5: Verify Astro runs**

```bash
npm run dev
```

Expected: Astro dev server starts on http://localhost:4321

**Step 6: Init git and commit**

```bash
cd ~/agency-starter
git init
git add -A
git commit -m "feat: scaffold agency-starter with Astro + Tailwind + theBCMS deps"
```

---

## Task 2: Theme System (CSS Custom Properties)

**Files:**
- Create: `~/agency-starter/src/styles/theme.css`
- Create: `~/agency-starter/src/styles/reset.css`

**Context:** The theme system extracts design tokens from the playground mockup the client picks. Every component reads from these CSS variables — change the theme file and the whole site updates. This is what replaces manually matching Bricks settings to a mockup.

**Step 1: Create theme.css with default tokens**

Create `src/styles/theme.css`:

```css
:root {
  /* Typography */
  --font-heading: 'Inter', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Font Sizes (fluid) */
  --text-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);
  --text-sm: clamp(0.875rem, 0.8rem + 0.375vw, 1rem);
  --text-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
  --text-lg: clamp(1.125rem, 1rem + 0.625vw, 1.25rem);
  --text-xl: clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem);
  --text-2xl: clamp(1.5rem, 1.2rem + 1.5vw, 2rem);
  --text-3xl: clamp(1.875rem, 1.4rem + 2.375vw, 2.5rem);
  --text-4xl: clamp(2.25rem, 1.5rem + 3.75vw, 3.5rem);

  /* Colors — warm organic default (swap per client) */
  --color-primary: #6B705C;
  --color-primary-light: #A5A58D;
  --color-primary-dark: #3A3D32;
  --color-accent: #CB997E;
  --color-accent-light: #DDBEA9;
  --color-accent-dark: #B07D62;
  --color-bg: #FFFCF7;
  --color-bg-alt: #F5F0EB;
  --color-surface: #FFFFFF;
  --color-text: #2D2D2D;
  --color-text-muted: #6B6B6B;
  --color-border: #E8E2DB;

  /* Spacing Scale */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  --space-2xl: 3rem;
  --space-3xl: 4rem;
  --space-section: clamp(4rem, 3rem + 5vw, 8rem);

  /* Border Radius */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 250ms ease;
  --transition-slow: 350ms ease;

  /* Container */
  --container-max: 72rem;
  --container-padding: clamp(1rem, 2vw, 2rem);
}
```

**Step 2: Create reset.css**

Create `src/styles/reset.css`:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  -webkit-text-size-adjust: 100%;
  font-family: var(--font-body);
  color: var(--color-text);
  background: var(--color-bg);
}

img, video, svg {
  display: block;
  max-width: 100%;
  height: auto;
}

a {
  color: inherit;
  text-decoration: none;
}

button {
  font: inherit;
  cursor: pointer;
}
```

**Step 3: Commit**

```bash
git add src/styles/
git commit -m "feat: add theme system with CSS custom properties + reset"
```

---

## Task 3: CMS Abstraction Layer

**Files:**
- Create: `~/agency-starter/src/lib/cms.ts`
- Create: `~/agency-starter/src/lib/types.ts`
- Create: `~/agency-starter/tests/lib/cms.test.ts`

**Context:** This is the file that makes CMS migration trivial. Astro pages import from `cms.ts`, never from the BCMS SDK directly. Swapping CMS = changing this one file.

**Step 1: Define content types**

Create `src/lib/types.ts`:

```typescript
export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  body: string
  coverImage?: string
  category?: string
  publishedAt: string
  author?: string
}

export interface Service {
  slug: string
  title: string
  description: string
  icon?: string
  image?: string
  price?: string
  order: number
}

export interface Testimonial {
  quote: string
  author: string
  role?: string
  avatar?: string
  rating?: number
}

export interface TeamMember {
  name: string
  role: string
  bio: string
  photo?: string
  order: number
}

export interface SiteConfig {
  name: string
  tagline: string
  description: string
  phone?: string
  email?: string
  address?: string
  socialLinks?: Record<string, string>
}
```

**Step 2: Write failing test for CMS abstraction**

Create `tests/lib/cms.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getBlogPosts,
  getServices,
  getTestimonials,
  getTeamMembers,
  getBlogPostBySlug,
} from '../../src/lib/cms'
import type { BlogPost, Service } from '../../src/lib/types'

// Mock the BCMS client
vi.mock('@thebcms/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    entry: {
      getAll: vi.fn().mockImplementation((template: string) => {
        const mockData: Record<string, unknown[]> = {
          blog: [
            {
              meta: { en: { slug: 'test-post', title: 'Test Post' } },
              content: { en: [{ value: 'Post body' }] },
            },
          ],
          service: [
            {
              meta: {
                en: {
                  slug: 'test-service',
                  title: 'Test Service',
                  description: 'A test service',
                  order: 1,
                },
              },
            },
          ],
          testimonial: [
            {
              meta: {
                en: {
                  quote: 'Great work!',
                  author: 'Jane Doe',
                  rating: 5,
                },
              },
            },
          ],
          team: [
            {
              meta: {
                en: {
                  name: 'John Smith',
                  role: 'Developer',
                  bio: 'A dev',
                  order: 1,
                },
              },
            },
          ],
        }
        return Promise.resolve(mockData[template] ?? [])
      }),
    },
  })),
}))

describe('CMS Abstraction Layer', () => {
  it('getBlogPosts returns normalized BlogPost[]', async () => {
    const posts = await getBlogPosts()
    expect(posts).toHaveLength(1)
    expect(posts[0].slug).toBe('test-post')
    expect(posts[0].title).toBe('Test Post')
  })

  it('getServices returns normalized Service[]', async () => {
    const services = await getServices()
    expect(services).toHaveLength(1)
    expect(services[0].slug).toBe('test-service')
    expect(services[0].title).toBe('Test Service')
  })

  it('getTestimonials returns normalized Testimonial[]', async () => {
    const testimonials = await getTestimonials()
    expect(testimonials).toHaveLength(1)
    expect(testimonials[0].quote).toBe('Great work!')
    expect(testimonials[0].author).toBe('Jane Doe')
  })

  it('getTeamMembers returns normalized TeamMember[]', async () => {
    const members = await getTeamMembers()
    expect(members).toHaveLength(1)
    expect(members[0].name).toBe('John Smith')
  })
})
```

**Step 3: Run test to verify it fails**

```bash
cd ~/agency-starter
npx vitest run tests/lib/cms.test.ts
```

Expected: FAIL — `Cannot find module '../../src/lib/cms'`

**Step 4: Implement cms.ts**

Create `src/lib/cms.ts`:

```typescript
import { Client } from '@thebcms/client'
import type {
  BlogPost,
  Service,
  Testimonial,
  TeamMember,
  SiteConfig,
} from './types'

// Initialize BCMS client from env vars
function createClient(): Client {
  return new Client({
    orgId: import.meta.env.BCMS_ORG_ID,
    instanceId: import.meta.env.BCMS_INSTANCE_ID,
    apiKeyId: import.meta.env.BCMS_API_KEY_ID,
    apiKeySecret: import.meta.env.BCMS_API_KEY_SECRET,
  })
}

const client = createClient()

// --- Normalizers (BCMS response → our types) ---
// These are the ONLY functions that know about BCMS data shape.
// If switching CMS, rewrite these + createClient. Nothing else changes.

function normalizeBlogPost(entry: Record<string, unknown>): BlogPost {
  const meta = (entry as any).meta?.en ?? {}
  const content = (entry as any).content?.en ?? []
  return {
    slug: meta.slug ?? '',
    title: meta.title ?? '',
    excerpt: meta.excerpt ?? '',
    body: content.map((c: any) => c.value ?? '').join('\n'),
    coverImage: meta.coverImage?.src ?? undefined,
    category: meta.category ?? undefined,
    publishedAt: meta.publishedAt ?? new Date().toISOString(),
    author: meta.author ?? undefined,
  }
}

function normalizeService(entry: Record<string, unknown>): Service {
  const meta = (entry as any).meta?.en ?? {}
  return {
    slug: meta.slug ?? '',
    title: meta.title ?? '',
    description: meta.description ?? '',
    icon: meta.icon ?? undefined,
    image: meta.image?.src ?? undefined,
    price: meta.price ?? undefined,
    order: meta.order ?? 0,
  }
}

function normalizeTestimonial(
  entry: Record<string, unknown>
): Testimonial {
  const meta = (entry as any).meta?.en ?? {}
  return {
    quote: meta.quote ?? '',
    author: meta.author ?? '',
    role: meta.role ?? undefined,
    avatar: meta.avatar?.src ?? undefined,
    rating: meta.rating ?? undefined,
  }
}

function normalizeTeamMember(
  entry: Record<string, unknown>
): TeamMember {
  const meta = (entry as any).meta?.en ?? {}
  return {
    name: meta.name ?? '',
    role: meta.role ?? '',
    bio: meta.bio ?? '',
    photo: meta.photo?.src ?? undefined,
    order: meta.order ?? 0,
  }
}

// --- Public API ---
// Astro pages import ONLY these functions.

export async function getBlogPosts(): Promise<BlogPost[]> {
  const entries = await client.entry.getAll('blog')
  return entries.map(normalizeBlogPost)
}

export async function getBlogPostBySlug(
  slug: string
): Promise<BlogPost | null> {
  const posts = await getBlogPosts()
  return posts.find((p) => p.slug === slug) ?? null
}

export async function getServices(): Promise<Service[]> {
  const entries = await client.entry.getAll('service')
  return entries.map(normalizeService).sort((a, b) => a.order - b.order)
}

export async function getTestimonials(): Promise<Testimonial[]> {
  const entries = await client.entry.getAll('testimonial')
  return entries.map(normalizeTestimonial)
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const entries = await client.entry.getAll('team')
  return entries.map(normalizeTeamMember).sort((a, b) => a.order - b.order)
}
```

**Step 5: Add vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
})
```

**Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/lib/cms.test.ts
```

Expected: All 4 tests PASS

**Step 7: Commit**

```bash
git add src/lib/ tests/ vitest.config.ts
git commit -m "feat: add CMS abstraction layer with theBCMS integration + tests"
```

---

## Task 4: Base Layout + Navbar + Footer

**Files:**
- Create: `~/agency-starter/src/layouts/Base.astro`
- Create: `~/agency-starter/src/components/layout/Navbar.astro`
- Create: `~/agency-starter/src/components/layout/Footer.astro`

**Context:** Every page uses Base.astro as its layout. It imports the theme CSS, sets up meta tags, and wraps content. The Navbar and Footer are the first components — they demonstrate the `data-vf-component` / `data-vf-file` attribute pattern needed for the future inspect overlay.

**Step 1: Create Base layout**

Create `src/layouts/Base.astro`:

```astro
---
import '../styles/reset.css'
import '../styles/theme.css'
import Navbar from '../components/layout/Navbar.astro'
import Footer from '../components/layout/Footer.astro'

interface Props {
  title: string
  description?: string
  ogImage?: string
}

const {
  title,
  description = 'Welcome to our site',
  ogImage,
} = Astro.props
const siteUrl = import.meta.env.SITE_URL ?? 'https://example.com'
const siteName = import.meta.env.SITE_NAME ?? 'Agency Site'
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} | {siteName}</title>
    <meta name="description" content={description} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content={siteUrl} />
    {ogImage && <meta property="og:image" content={ogImage} />}
    <link rel="canonical" href={siteUrl} />
  </head>
  <body>
    <Navbar siteName={siteName} />
    <main>
      <slot />
    </main>
    <Footer siteName={siteName} />
  </body>
</html>

<style is:global>
  body {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  main {
    flex: 1;
  }
</style>
```

**Step 2: Create Navbar component**

Create `src/components/layout/Navbar.astro`:

```astro
---
interface Props {
  siteName: string
}

const { siteName } = Astro.props

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'Services', href: '/services' },
  { label: 'About', href: '/about' },
  { label: 'Blog', href: '/blog' },
  { label: 'Contact', href: '/contact' },
]
---

<nav
  data-vf-component="Navbar"
  data-vf-file="src/components/layout/Navbar.astro"
  class="navbar"
>
  <div class="navbar__inner">
    <a href="/" class="navbar__logo">{siteName}</a>
    <ul class="navbar__links">
      {navLinks.map(({ label, href }) => (
        <li>
          <a href={href} class="navbar__link">{label}</a>
        </li>
      ))}
    </ul>
  </div>
</nav>

<style>
  .navbar {
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    backdrop-filter: blur(8px);
  }
  .navbar__inner {
    max-width: var(--container-max);
    margin: 0 auto;
    padding: var(--space-md) var(--container-padding);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .navbar__logo {
    font-family: var(--font-heading);
    font-size: var(--text-xl);
    font-weight: 700;
    color: var(--color-primary-dark);
  }
  .navbar__links {
    display: flex;
    gap: var(--space-lg);
    list-style: none;
  }
  .navbar__link {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    transition: color var(--transition-fast);
  }
  .navbar__link:hover {
    color: var(--color-primary);
  }
</style>
```

**Step 3: Create Footer component**

Create `src/components/layout/Footer.astro`:

```astro
---
interface Props {
  siteName: string
}

const { siteName } = Astro.props
const year = new Date().getFullYear()
---

<footer
  data-vf-component="Footer"
  data-vf-file="src/components/layout/Footer.astro"
  class="footer"
>
  <div class="footer__inner">
    <p class="footer__copy">
      &copy; {year} {siteName}. All rights reserved.
    </p>
  </div>
</footer>

<style>
  .footer {
    background: var(--color-bg-alt);
    border-top: 1px solid var(--color-border);
  }
  .footer__inner {
    max-width: var(--container-max);
    margin: 0 auto;
    padding: var(--space-xl) var(--container-padding);
    text-align: center;
  }
  .footer__copy {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
</style>
```

**Step 4: Verify layout renders**

Update `src/pages/index.astro`:

```astro
---
import Base from '../layouts/Base.astro'
---

<Base title="Home">
  <section style="padding: var(--space-section) var(--container-padding); text-align: center;">
    <h1 style="font-size: var(--text-4xl); font-family: var(--font-heading); font-weight: 700;">
      Agency Starter
    </h1>
    <p style="font-size: var(--text-lg); color: var(--color-text-muted); margin-top: var(--space-md);">
      Your site starts here.
    </p>
  </section>
</Base>
```

```bash
npm run dev
```

Expected: Page renders with Navbar, placeholder content, and Footer. Theme colors applied.

**Step 5: Commit**

```bash
git add src/layouts/ src/components/layout/ src/pages/index.astro
git commit -m "feat: add Base layout + Navbar + Footer with theme vars + VF data attributes"
```

---

## Task 5: Hero Components (2 Variants)

**Files:**
- Create: `~/agency-starter/src/components/heroes/HeroCentered.astro`
- Create: `~/agency-starter/src/components/heroes/HeroSplit.astro`

**Context:** Heroes are the most visible section. Two variants: centered (classic) and split (image + text). Both use theme CSS vars and include the `data-vf-*` attributes for the future inspect overlay.

**Step 1: Create HeroCentered**

Create `src/components/heroes/HeroCentered.astro`:

```astro
---
interface Props {
  title: string
  subtitle?: string
  ctaText?: string
  ctaHref?: string
}

const {
  title,
  subtitle,
  ctaText = 'Get Started',
  ctaHref = '/contact',
} = Astro.props
---

<section
  data-vf-component="HeroCentered"
  data-vf-file="src/components/heroes/HeroCentered.astro"
  class="hero-centered"
>
  <div class="hero-centered__inner">
    <h1 class="hero-centered__title">{title}</h1>
    {subtitle && (
      <p class="hero-centered__subtitle">{subtitle}</p>
    )}
    <a href={ctaHref} class="hero-centered__cta">{ctaText}</a>
  </div>
</section>

<style>
  .hero-centered {
    padding: var(--space-section) var(--container-padding);
    background: var(--color-bg-alt);
    text-align: center;
  }
  .hero-centered__inner {
    max-width: var(--container-max);
    margin: 0 auto;
  }
  .hero-centered__title {
    font-family: var(--font-heading);
    font-size: var(--text-4xl);
    font-weight: 800;
    color: var(--color-primary-dark);
    line-height: 1.1;
  }
  .hero-centered__subtitle {
    font-size: var(--text-lg);
    color: var(--color-text-muted);
    margin-top: var(--space-lg);
    max-width: 36rem;
    margin-inline: auto;
    line-height: 1.6;
  }
  .hero-centered__cta {
    display: inline-block;
    margin-top: var(--space-xl);
    padding: var(--space-sm) var(--space-xl);
    background: var(--color-accent);
    color: white;
    font-weight: 600;
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }
  .hero-centered__cta:hover {
    background: var(--color-accent-dark);
  }
</style>
```

**Step 2: Create HeroSplit**

Create `src/components/heroes/HeroSplit.astro`:

```astro
---
interface Props {
  title: string
  subtitle?: string
  image: string
  imageAlt?: string
  ctaText?: string
  ctaHref?: string
  reversed?: boolean
}

const {
  title,
  subtitle,
  image,
  imageAlt = '',
  ctaText = 'Learn More',
  ctaHref = '/contact',
  reversed = false,
} = Astro.props
---

<section
  data-vf-component="HeroSplit"
  data-vf-file="src/components/heroes/HeroSplit.astro"
  class:list={['hero-split', { 'hero-split--reversed': reversed }]}
>
  <div class="hero-split__inner">
    <div class="hero-split__content">
      <h1 class="hero-split__title">{title}</h1>
      {subtitle && (
        <p class="hero-split__subtitle">{subtitle}</p>
      )}
      <a href={ctaHref} class="hero-split__cta">{ctaText}</a>
    </div>
    <div class="hero-split__media">
      <img src={image} alt={imageAlt} class="hero-split__image" />
    </div>
  </div>
</section>

<style>
  .hero-split {
    padding: var(--space-section) var(--container-padding);
  }
  .hero-split__inner {
    max-width: var(--container-max);
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3xl);
    align-items: center;
  }
  .hero-split--reversed .hero-split__inner {
    direction: rtl;
  }
  .hero-split--reversed .hero-split__content,
  .hero-split--reversed .hero-split__media {
    direction: ltr;
  }
  .hero-split__title {
    font-family: var(--font-heading);
    font-size: var(--text-4xl);
    font-weight: 800;
    color: var(--color-primary-dark);
    line-height: 1.1;
  }
  .hero-split__subtitle {
    font-size: var(--text-lg);
    color: var(--color-text-muted);
    margin-top: var(--space-lg);
    line-height: 1.6;
  }
  .hero-split__cta {
    display: inline-block;
    margin-top: var(--space-xl);
    padding: var(--space-sm) var(--space-xl);
    background: var(--color-accent);
    color: white;
    font-weight: 600;
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }
  .hero-split__cta:hover {
    background: var(--color-accent-dark);
  }
  .hero-split__image {
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }
  @media (max-width: 768px) {
    .hero-split__inner {
      grid-template-columns: 1fr;
    }
    .hero-split--reversed .hero-split__inner {
      direction: ltr;
    }
  }
</style>
```

**Step 3: Update index.astro to use hero**

```astro
---
import Base from '../layouts/Base.astro'
import HeroCentered from '../components/heroes/HeroCentered.astro'
---

<Base title="Home">
  <HeroCentered
    title="Your Med Spa, Elevated"
    subtitle="Premium skincare and wellness treatments tailored to you."
    ctaText="Book Consultation"
    ctaHref="/contact"
  />
</Base>
```

**Step 4: Verify renders**

```bash
npm run dev
```

Expected: Hero section renders with theme colors, centered layout, CTA button.

**Step 5: Commit**

```bash
git add src/components/heroes/ src/pages/index.astro
git commit -m "feat: add HeroCentered + HeroSplit components with theme vars"
```

---

## Task 6: Feature Grid Component

**Files:**
- Create: `~/agency-starter/src/components/features/FeatureGrid.astro`

**Step 1: Create FeatureGrid**

Create `src/components/features/FeatureGrid.astro`:

```astro
---
import type { Service } from '../../lib/types'

interface Props {
  title?: string
  subtitle?: string
  items: Service[]
  columns?: 2 | 3 | 4
}

const {
  title,
  subtitle,
  items,
  columns = 3,
} = Astro.props
---

<section
  data-vf-component="FeatureGrid"
  data-vf-file="src/components/features/FeatureGrid.astro"
  class="feature-grid"
>
  <div class="feature-grid__inner">
    {title && (
      <div class="feature-grid__header">
        <h2 class="feature-grid__title">{title}</h2>
        {subtitle && (
          <p class="feature-grid__subtitle">{subtitle}</p>
        )}
      </div>
    )}
    <div class="feature-grid__items" style={`--cols: ${columns}`}>
      {items.map((item) => (
        <div class="feature-grid__card">
          {item.icon && (
            <span class="feature-grid__icon">{item.icon}</span>
          )}
          <h3 class="feature-grid__card-title">{item.title}</h3>
          <p class="feature-grid__card-desc">{item.description}</p>
          {item.price && (
            <span class="feature-grid__price">{item.price}</span>
          )}
        </div>
      ))}
    </div>
  </div>
</section>

<style>
  .feature-grid {
    padding: var(--space-section) var(--container-padding);
  }
  .feature-grid__inner {
    max-width: var(--container-max);
    margin: 0 auto;
  }
  .feature-grid__header {
    text-align: center;
    margin-bottom: var(--space-3xl);
  }
  .feature-grid__title {
    font-family: var(--font-heading);
    font-size: var(--text-3xl);
    font-weight: 700;
    color: var(--color-primary-dark);
  }
  .feature-grid__subtitle {
    font-size: var(--text-base);
    color: var(--color-text-muted);
    margin-top: var(--space-sm);
    max-width: 32rem;
    margin-inline: auto;
  }
  .feature-grid__items {
    display: grid;
    grid-template-columns: repeat(var(--cols, 3), 1fr);
    gap: var(--space-xl);
  }
  .feature-grid__card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-xl);
    transition: box-shadow var(--transition-base);
  }
  .feature-grid__card:hover {
    box-shadow: var(--shadow-md);
  }
  .feature-grid__icon {
    font-size: var(--text-2xl);
    display: block;
    margin-bottom: var(--space-md);
  }
  .feature-grid__card-title {
    font-family: var(--font-heading);
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-primary-dark);
  }
  .feature-grid__card-desc {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin-top: var(--space-sm);
    line-height: 1.6;
  }
  .feature-grid__price {
    display: inline-block;
    margin-top: var(--space-md);
    font-weight: 600;
    color: var(--color-accent-dark);
  }
  @media (max-width: 768px) {
    .feature-grid__items {
      grid-template-columns: 1fr;
    }
  }
</style>
```

**Step 2: Commit**

```bash
git add src/components/features/
git commit -m "feat: add FeatureGrid component with dynamic columns + theme vars"
```

---

## Task 7: Contact Form Component

**Files:**
- Create: `~/agency-starter/src/components/forms/ContactForm.astro`

**Context:** This form submits to the shared CF Worker form handler. The `action` prop points to `https://forms.jbcloud.app/{client-slug}`. No JavaScript required — it's a standard HTML form with progressive enhancement.

**Step 1: Create ContactForm**

Create `src/components/forms/ContactForm.astro`:

```astro
---
interface Props {
  action: string
  title?: string
  subtitle?: string
  fields?: Array<{
    name: string
    label: string
    type: 'text' | 'email' | 'tel' | 'textarea'
    required?: boolean
    placeholder?: string
  }>
}

const {
  action,
  title = 'Get in Touch',
  subtitle,
  fields = [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'phone', label: 'Phone', type: 'tel', required: false },
    { name: 'message', label: 'Message', type: 'textarea', required: true },
  ],
} = Astro.props
---

<section
  data-vf-component="ContactForm"
  data-vf-file="src/components/forms/ContactForm.astro"
  class="contact-form"
>
  <div class="contact-form__inner">
    {title && <h2 class="contact-form__title">{title}</h2>}
    {subtitle && <p class="contact-form__subtitle">{subtitle}</p>}

    <form method="POST" action={action} class="contact-form__form">
      {fields.map((field) => (
        <div class="contact-form__field">
          <label for={field.name} class="contact-form__label">
            {field.label}
            {field.required && <span class="contact-form__required">*</span>}
          </label>
          {field.type === 'textarea' ? (
            <textarea
              id={field.name}
              name={field.name}
              required={field.required}
              placeholder={field.placeholder}
              rows="4"
              class="contact-form__input contact-form__textarea"
            />
          ) : (
            <input
              id={field.name}
              name={field.name}
              type={field.type}
              required={field.required}
              placeholder={field.placeholder}
              class="contact-form__input"
            />
          )}
        </div>
      ))}
      <button type="submit" class="contact-form__submit">Send Message</button>
    </form>
  </div>
</section>

<style>
  .contact-form {
    padding: var(--space-section) var(--container-padding);
    background: var(--color-bg-alt);
  }
  .contact-form__inner {
    max-width: 36rem;
    margin: 0 auto;
  }
  .contact-form__title {
    font-family: var(--font-heading);
    font-size: var(--text-3xl);
    font-weight: 700;
    color: var(--color-primary-dark);
    text-align: center;
  }
  .contact-form__subtitle {
    text-align: center;
    color: var(--color-text-muted);
    margin-top: var(--space-sm);
  }
  .contact-form__form {
    margin-top: var(--space-2xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }
  .contact-form__label {
    display: block;
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text);
    margin-bottom: var(--space-xs);
  }
  .contact-form__required {
    color: var(--color-accent-dark);
  }
  .contact-form__input {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    font-family: var(--font-body);
    background: var(--color-surface);
    color: var(--color-text);
    transition: border-color var(--transition-fast);
  }
  .contact-form__input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(107, 112, 92, 0.15);
  }
  .contact-form__textarea {
    resize: vertical;
    min-height: 6rem;
  }
  .contact-form__submit {
    padding: var(--space-sm) var(--space-xl);
    background: var(--color-accent);
    color: white;
    font-weight: 600;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    transition: background var(--transition-fast);
    align-self: flex-start;
  }
  .contact-form__submit:hover {
    background: var(--color-accent-dark);
  }
</style>
```

**Step 2: Commit**

```bash
git add src/components/forms/
git commit -m "feat: add ContactForm component with configurable fields + form action"
```

---

## Task 8: Testimonial Component

**Files:**
- Create: `~/agency-starter/src/components/social-proof/TestimonialCarousel.astro`

**Step 1: Create TestimonialCarousel**

Create `src/components/social-proof/TestimonialCarousel.astro`:

```astro
---
import type { Testimonial } from '../../lib/types'

interface Props {
  title?: string
  testimonials: Testimonial[]
}

const { title = 'What Our Clients Say', testimonials } = Astro.props
---

<section
  data-vf-component="TestimonialCarousel"
  data-vf-file="src/components/social-proof/TestimonialCarousel.astro"
  class="testimonials"
>
  <div class="testimonials__inner">
    {title && <h2 class="testimonials__title">{title}</h2>}
    <div class="testimonials__grid">
      {testimonials.map((t) => (
        <blockquote class="testimonials__card">
          {t.rating && (
            <div class="testimonials__rating">
              {'★'.repeat(t.rating)}{'☆'.repeat(5 - t.rating)}
            </div>
          )}
          <p class="testimonials__quote">"{t.quote}"</p>
          <footer class="testimonials__author">
            {t.avatar && (
              <img src={t.avatar} alt={t.author} class="testimonials__avatar" />
            )}
            <div>
              <cite class="testimonials__name">{t.author}</cite>
              {t.role && <span class="testimonials__role">{t.role}</span>}
            </div>
          </footer>
        </blockquote>
      ))}
    </div>
  </div>
</section>

<style>
  .testimonials {
    padding: var(--space-section) var(--container-padding);
  }
  .testimonials__inner {
    max-width: var(--container-max);
    margin: 0 auto;
  }
  .testimonials__title {
    font-family: var(--font-heading);
    font-size: var(--text-3xl);
    font-weight: 700;
    color: var(--color-primary-dark);
    text-align: center;
    margin-bottom: var(--space-3xl);
  }
  .testimonials__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: var(--space-xl);
  }
  .testimonials__card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-xl);
  }
  .testimonials__rating {
    color: var(--color-accent);
    font-size: var(--text-lg);
    margin-bottom: var(--space-sm);
  }
  .testimonials__quote {
    font-size: var(--text-base);
    color: var(--color-text);
    line-height: 1.7;
    font-style: italic;
  }
  .testimonials__author {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-lg);
  }
  .testimonials__avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--radius-full);
    object-fit: cover;
  }
  .testimonials__name {
    font-style: normal;
    font-weight: 600;
    font-size: var(--text-sm);
    display: block;
  }
  .testimonials__role {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }
</style>
```

**Step 2: Commit**

```bash
git add src/components/social-proof/
git commit -m "feat: add TestimonialCarousel component with rating stars + theme vars"
```

---

## Task 9: Compose Demo Homepage

**Files:**
- Modify: `~/agency-starter/src/pages/index.astro`

**Context:** Wire all components together into a realistic homepage to verify the component library works end-to-end with the theme system.

**Step 1: Update index.astro with all components**

```astro
---
import Base from '../layouts/Base.astro'
import HeroCentered from '../components/heroes/HeroCentered.astro'
import FeatureGrid from '../components/features/FeatureGrid.astro'
import TestimonialCarousel from '../components/social-proof/TestimonialCarousel.astro'
import ContactForm from '../components/forms/ContactForm.astro'
import type { Service, Testimonial } from '../lib/types'

// Demo data — in production these come from CMS via cms.ts
const services: Service[] = [
  {
    slug: 'facials',
    title: 'Custom Facials',
    description: 'Personalized treatments for radiant, healthy skin.',
    icon: '✨',
    order: 1,
  },
  {
    slug: 'botox',
    title: 'Botox & Fillers',
    description: 'Natural-looking results from experienced injectors.',
    icon: '💉',
    order: 2,
  },
  {
    slug: 'laser',
    title: 'Laser Treatments',
    description: 'Advanced technology for skin resurfacing and hair removal.',
    icon: '⚡',
    order: 3,
  },
]

const testimonials: Testimonial[] = [
  {
    quote: 'The best med spa experience. Professional, clean, and the results speak for themselves.',
    author: 'Sarah M.',
    role: 'Client since 2024',
    rating: 5,
  },
  {
    quote: 'Finally found a team I trust. They listen to what I want and deliver every time.',
    author: 'Jessica L.',
    role: 'Client since 2023',
    rating: 5,
  },
  {
    quote: 'My skin has never looked better. Worth every penny.',
    author: 'Amanda R.',
    role: 'Client since 2025',
    rating: 5,
  },
]
---

<Base title="Home" description="Premium med spa treatments tailored to you.">
  <HeroCentered
    title="Your Beauty, Elevated"
    subtitle="Premium skincare and wellness treatments tailored to you. Expert care in a luxurious setting."
    ctaText="Book Consultation"
    ctaHref="/contact"
  />
  <FeatureGrid
    title="Our Services"
    subtitle="Discover treatments designed for your unique needs."
    items={services}
    columns={3}
  />
  <TestimonialCarousel testimonials={testimonials} />
  <ContactForm
    action="https://forms.jbcloud.app/demo"
    title="Ready to Get Started?"
    subtitle="Book your free consultation today."
  />
</Base>
```

**Step 2: Verify full page renders**

```bash
npm run dev
```

Expected: Full med spa homepage with hero, 3 service cards, 3 testimonials, and contact form. All using warm organic theme colors.

**Step 3: Build to verify static generation works**

```bash
npm run build
```

Expected: Clean build, static HTML in `dist/`

**Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: compose demo homepage with all core components"
```

---

## Task 10: CF Worker Form Handler

**Files:**
- Create: `~/forms-worker/package.json`
- Create: `~/forms-worker/wrangler.toml`
- Create: `~/forms-worker/src/index.ts`
- Create: `~/forms-worker/tests/index.test.ts`

**Context:** One shared Worker handles contact forms for ALL client sites. Routes by slug in the URL path. Validates with Zod, sends email via Resend, optionally writes to D1.

**Step 1: Scaffold the Worker**

```bash
cd ~
mkdir forms-worker && cd forms-worker
npm init -y
npm install hono zod
npm install -D wrangler vitest @cloudflare/vitest-pool-workers typescript
```

**Step 2: Create wrangler.toml**

Create `wrangler.toml`:

```toml
name = "forms-worker"
main = "src/index.ts"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[vars]
RESEND_API_KEY = ""
FROM_EMAIL = "forms@jbcloud.app"

# Optional: D1 database for lead storage
# [[d1_databases]]
# binding = "DB"
# database_name = "forms-db"
# database_id = "your-d1-id"
```

**Step 3: Write failing test**

Create `tests/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateFormData, routeBySlug } from '../src/index'

describe('Form Worker', () => {
  it('validates required fields', () => {
    const result = validateFormData(
      { name: '', email: 'bad', message: '' },
      'default'
    )
    expect(result.success).toBe(false)
  })

  it('passes valid form data', () => {
    const result = validateFormData(
      { name: 'Jane', email: 'jane@example.com', message: 'Hello' },
      'default'
    )
    expect(result.success).toBe(true)
  })

  it('extracts slug from URL path', () => {
    expect(routeBySlug('/medspa')).toBe('medspa')
    expect(routeBySlug('/jupiter/special')).toBe('jupiter')
    expect(routeBySlug('/')).toBe('default')
  })
})
```

**Step 4: Run test to verify it fails**

```bash
cd ~/forms-worker
npx vitest run tests/index.test.ts
```

Expected: FAIL — functions not exported yet

**Step 5: Implement the Worker**

Create `src/index.ts`:

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'

type Env = {
  RESEND_API_KEY: string
  FROM_EMAIL: string
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors({
  origin: '*',
  allowMethods: ['POST', 'OPTIONS'],
}))

// --- Validation ---

const baseSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  message: z.string().min(1, 'Message is required'),
})

// Per-client schema overrides (add custom fields per client)
const clientSchemas: Record<string, z.ZodSchema> = {
  default: baseSchema,
}

export function validateFormData(
  data: Record<string, unknown>,
  slug: string
) {
  const schema = clientSchemas[slug] ?? baseSchema
  return schema.safeParse(data)
}

export function routeBySlug(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[0] ?? 'default'
}

// --- Client config (recipient emails per slug) ---

const clientConfig: Record<string, { to: string; subject: string }> = {
  default: {
    to: 'hello@jbmdcreations.com',
    subject: 'New Contact Form Submission',
  },
  // Add clients:
  // medspa: { to: 'info@medsparanker.com', subject: 'New Lead' },
}

// --- Email via Resend ---

async function sendEmail(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  data: Record<string, unknown>
) {
  const body = Object.entries(data)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject: `${subject} — ${(data as any).name ?? 'Unknown'}`,
      text: body,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend API error: ${res.status} ${err}`)
  }

  return res.json()
}

// --- Routes ---

app.post('/:slug{.+}', async (c) => {
  const slug = routeBySlug(c.req.path)
  const config = clientConfig[slug] ?? clientConfig.default

  let formData: Record<string, unknown>

  const contentType = c.req.header('content-type') ?? ''
  if (contentType.includes('application/json')) {
    formData = await c.req.json()
  } else {
    const fd = await c.req.formData()
    formData = Object.fromEntries(fd.entries())
  }

  const validation = validateFormData(formData, slug)
  if (!validation.success) {
    return c.json(
      { success: false, errors: validation.error.flatten().fieldErrors },
      400
    )
  }

  try {
    await sendEmail(
      c.env.RESEND_API_KEY,
      c.env.FROM_EMAIL,
      config.to,
      config.subject,
      validation.data as Record<string, unknown>
    )

    return c.json({ success: true, message: 'Form submitted' })
  } catch (err) {
    console.error('Form submission error:', err)
    return c.json(
      { success: false, error: 'Failed to send. Please try again.' },
      500
    )
  }
})

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'forms-worker' }))

export default app
```

**Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/index.test.ts
```

Expected: All 3 tests PASS

**Step 7: Init git and commit**

```bash
cd ~/forms-worker
git init
git add -A
git commit -m "feat: forms-worker — shared CF Worker form handler with Zod validation + Resend email"
```

---

## Task 11: Push Both Repos to GitHub

**Step 1: Create GitHub repos and push**

```bash
cd ~/agency-starter
gh repo create Aventerica89/agency-starter --public --source=. --push

cd ~/forms-worker
gh repo create Aventerica89/forms-worker --private --source=. --push
```

**Step 2: Verify repos on GitHub**

```bash
gh repo view Aventerica89/agency-starter --web
gh repo view Aventerica89/forms-worker --web
```

**Step 3: Deploy forms-worker (when Resend key is configured)**

```bash
cd ~/forms-worker
npx wrangler deploy
```

Note: Must set `RESEND_API_KEY` as a secret first:
```bash
npx wrangler secret put RESEND_API_KEY
```

---

## Summary

After completing all 11 tasks:

| What | Status |
|------|--------|
| agency-starter repo | Scaffolded with Astro + Tailwind + theBCMS |
| Theme system | CSS custom properties, swap-per-client |
| CMS abstraction | `cms.ts` with normalizers, tested |
| Components | HeroCentered, HeroSplit, FeatureGrid, TestimonialCarousel, ContactForm, Navbar, Footer |
| data-vf-* attributes | On all components (future inspect overlay) |
| Demo homepage | Full med spa page with all components |
| Forms Worker | Shared Worker with Zod validation + Resend email |
| Tests | CMS layer + form validation covered |
| Git | Both repos on GitHub |

**Next: Phase 1** (expand component library — more heroes, CTAs, pricing, blog templates, team grid) then **Phase 2** (VaporForge Agency Mode — the inspect overlay + scoped AI editing).
