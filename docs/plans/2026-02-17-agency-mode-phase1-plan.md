# Agency Mode Phase 1: Full Component Library — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand the agency-starter component library from 7 to 31 components, covering every section type needed for agency client sites.

**Architecture:** All components follow the Phase 0 pattern: Astro components with typed Props, BEM-style scoped CSS using ONLY CSS custom properties from theme.css, `data-vf-component` + `data-vf-file` attributes, responsive at 768px breakpoint.

**Tech Stack:** Astro 5, TypeScript, CSS custom properties (zero hardcoded values)

**Repo:** ~/agency-starter (branch: main)

---

## Component Pattern Reference

Every component in this plan MUST follow this exact pattern:

```astro
---
interface Props {
  // typed props
}
const { prop1, prop2 = 'default' } = Astro.props
---

<section
  class="component-name"
  data-vf-component="ComponentName"
  data-vf-file="src/components/category/ComponentName.astro"
>
  <div class="component-name__inner">
    <!-- content -->
  </div>
</section>

<style>
  .component-name {
    padding: var(--space-section) var(--container-padding);
  }
  .component-name__inner {
    max-width: var(--container-max);
    margin: 0 auto;
  }
  /* ALL values from var(--*) — NO hardcoded colors, sizes, spacing */
  @media (min-width: 768px) {
    /* responsive overrides */
  }
</style>
```

### Theme Variables Available

- **Typography:** `--font-heading`, `--font-body`, `--font-mono`
- **Font Sizes:** `--text-xs`, `--text-sm`, `--text-base`, `--text-lg`, `--text-xl`, `--text-2xl`, `--text-3xl`, `--text-4xl`
- **Colors:** `--color-primary`, `--color-primary-light`, `--color-primary-dark`, `--color-accent`, `--color-accent-light`, `--color-accent-dark`, `--color-bg`, `--color-bg-alt`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-border`
- **Spacing:** `--space-xs`, `--space-sm`, `--space-md`, `--space-lg`, `--space-xl`, `--space-2xl`, `--space-3xl`, `--space-section`
- **Radii:** `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-full`
- **Shadows:** `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- **Transitions:** `--transition-fast`, `--transition-base`, `--transition-slow`
- **Container:** `--container-max`, `--container-padding`

### Existing Content Types (src/lib/types.ts)

```typescript
Service { slug, title, description, icon?, image?, price?, order }
Testimonial { quote, author, role?, avatar?, rating? }
TeamMember { name, role, bio, photo?, order }
BlogPost { slug, title, excerpt, body, coverImage?, category?, publishedAt, author? }
SiteConfig { name, tagline, description, phone?, email?, address?, socialLinks? }
```

---

## Task 1: Heroes + Layout (4 components)

**Files:**
- Create: `src/components/heroes/HeroVideo.astro`
- Create: `src/components/heroes/HeroMinimal.astro`
- Create: `src/components/layout/Sidebar.astro`
- Create: `src/components/layout/Breadcrumbs.astro`

### HeroVideo.astro

Props: `title: string`, `subtitle?: string`, `videoSrc: string`, `posterImage?: string`, `ctaText?: string`, `ctaHref?: string`, `overlay?: boolean`

- Full-width hero with background video (HTML5 `<video>` tag, autoplay, muted, loop, playsinline)
- Dark overlay (semi-transparent) over video for text readability when `overlay` is true
- Text content centered on top of video (white text when overlay active)
- CTA button styled with accent color
- Falls back to poster image if video doesn't load
- Mobile: video hidden, poster image shown as background instead (saves bandwidth)

### HeroMinimal.astro

Props: `title: string`, `subtitle?: string`, `alignment?: 'left' | 'center'`

- Simple text-only hero with generous padding
- No CTA, no image — just title and optional subtitle
- Good for inner pages (About, Contact, Blog listing)
- `alignment` prop controls text alignment (default: center)

### Sidebar.astro

Props: `position?: 'left' | 'right'`

- Wrapper component that creates a sidebar layout
- Uses CSS Grid: sidebar (var(--space-section) width) + main content area
- Slot for sidebar content, named slot `main` for main content
- Responsive: stacks vertically on mobile
- Sticky sidebar on desktop

### Breadcrumbs.astro

Props: `items: Array<{ label: string; href?: string }>`

- Horizontal breadcrumb trail with separators
- Last item is plain text (current page), others are links
- Separator: `/` character styled with muted color
- Wrapped in `<nav aria-label="Breadcrumb">` for accessibility

**Commit after all 4:**
```bash
git add src/components/heroes/HeroVideo.astro src/components/heroes/HeroMinimal.astro src/components/layout/Sidebar.astro src/components/layout/Breadcrumbs.astro
git commit -m "feat: add HeroVideo, HeroMinimal, Sidebar, Breadcrumbs components"
```

---

## Task 2: Features (3 components)

**Files:**
- Create: `src/components/features/FeatureAlternating.astro`
- Create: `src/components/features/FeatureTabs.astro`
- Create: `src/components/features/FeatureIconList.astro`

### FeatureAlternating.astro

Props: `items: Array<{ title: string; description: string; image: string; imageAlt?: string }>`

- Alternating rows: image left / text right, then image right / text left
- Each row is a 2-column grid
- Uses CSS `nth-child(even)` to reverse direction (no RTL trick needed — use `order` property)
- Responsive: single column on mobile, image always on top

### FeatureTabs.astro

Props: `tabs: Array<{ label: string; title: string; description: string; image?: string }>`

- Horizontal tab bar at top
- Clicking tab shows corresponding content panel below
- Uses HTML-only approach: radio inputs + CSS `:checked` sibling selectors (no JS)
- First tab active by default
- Tab bar scrolls horizontally on mobile
- Content panel: title + description + optional image

### FeatureIconList.astro

Props: `title?: string`, `subtitle?: string`, `items: Array<{ icon: string; title: string; description: string }>`

- Vertical list of features (not grid)
- Each item: icon on left, title + description on right
- Clean horizontal lines between items
- Good for process steps, feature lists, how-it-works sections

**Commit after all 3:**
```bash
git add src/components/features/
git commit -m "feat: add FeatureAlternating, FeatureTabs, FeatureIconList components"
```

---

## Task 3: Social Proof + CTA (6 components)

**Files:**
- Create: `src/components/social-proof/TestimonialSingle.astro`
- Create: `src/components/social-proof/LogoCloud.astro`
- Create: `src/components/social-proof/StatsBar.astro`
- Create: `src/components/cta/CTABanner.astro`
- Create: `src/components/cta/CTAInline.astro`
- Create: `src/components/cta/CTASplit.astro`

### TestimonialSingle.astro

Props: `testimonial: Testimonial` (imports from `../../lib/types`)

- Single large testimonial (spotlight style)
- Large quote text centered, author below with avatar
- Decorative large quotation mark (`"`) as background element
- Rating stars if present
- Good for hero-adjacent placement

### LogoCloud.astro

Props: `title?: string`, `logos: Array<{ src: string; alt: string; href?: string }>`

- Horizontal row of client/partner logos
- Logos have muted opacity (0.6) that increases on hover
- Auto-wraps on smaller screens
- Optional title above (e.g., "Trusted by")
- Logos maintain aspect ratio, fixed height

### StatsBar.astro

Props: `stats: Array<{ value: string; label: string }>`

- Horizontal bar of 3-4 stats (e.g., "500+ Clients", "10 Years", "5-Star Rated")
- Large number/value, smaller label below
- Centered text, divided by borders
- Background: accent color with white text, or surface with primary text

### CTABanner.astro

Props: `title: string`, `subtitle?: string`, `ctaText: string`, `ctaHref: string`, `variant?: 'primary' | 'accent'`

- Full-width banner with background color
- Title + subtitle + CTA button centered
- `primary` variant: primary-dark bg with surface text
- `accent` variant: accent bg with white text

### CTAInline.astro

Props: `text: string`, `ctaText: string`, `ctaHref: string`

- Compact single-line CTA: text on left, button on right
- Good for inserting between content sections
- No section padding — meant to be used within other containers
- Flex row, responsive wraps to column on mobile

### CTASplit.astro

Props: `title: string`, `description: string`, `ctaText: string`, `ctaHref: string`, `image: string`, `imageAlt?: string`, `reversed?: boolean`

- Two-column: content (title + description + CTA) on one side, image on other
- `reversed` flips the layout
- Similar to HeroSplit but smaller, no h1, meant for mid-page use
- Uses CSS `order` property for reversal

**Commit after all 6:**
```bash
git add src/components/social-proof/ src/components/cta/
git commit -m "feat: add TestimonialSingle, LogoCloud, StatsBar, CTABanner, CTAInline, CTASplit"
```

---

## Task 4: Content (4 components)

**Files:**
- Create: `src/components/content/BlogGrid.astro`
- Create: `src/components/content/BlogList.astro`
- Create: `src/components/content/TeamGrid.astro`
- Create: `src/components/content/FAQAccordion.astro`

### BlogGrid.astro

Props: `title?: string`, `posts: BlogPost[]`, `columns?: 2 | 3` (imports BlogPost from types)

- Grid of blog post cards
- Each card: cover image (if present), category badge, title, excerpt (truncated), date, read more link
- Cards link to `/blog/{slug}`
- Responsive: single column on mobile

### BlogList.astro

Props: `title?: string`, `posts: BlogPost[]`

- Vertical list layout (not grid)
- Each item: horizontal row with image left (small thumbnail), content right
- Shows title, excerpt, date, category
- Good for blog index pages, news sections
- Responsive: image stacks above text on mobile

### TeamGrid.astro

Props: `title?: string`, `subtitle?: string`, `members: TeamMember[]`, `columns?: 2 | 3 | 4`

- Grid of team member cards
- Each card: photo (circular or rounded), name, role, short bio
- Hover: subtle scale + shadow
- Responsive: 2 columns on tablet, 1 on mobile

### FAQAccordion.astro

Props: `title?: string`, `items: Array<{ question: string; answer: string }>`

- Expandable FAQ list using HTML `<details>` + `<summary>` (no JS needed)
- Smooth open/close with CSS transition on max-height
- Custom arrow/chevron indicator
- Only one open at a time (use `name` attribute on details for exclusive behavior)
- Clean styling with borders between items

**Commit after all 4:**
```bash
git add src/components/content/
git commit -m "feat: add BlogGrid, BlogList, TeamGrid, FAQAccordion components"
```

---

## Task 5: Forms + Pricing (4 components)

**Files:**
- Create: `src/components/forms/NewsletterSignup.astro`
- Create: `src/components/forms/QuoteRequest.astro`
- Create: `src/components/pricing/PricingTable.astro`
- Create: `src/components/pricing/PricingCards.astro`

### NewsletterSignup.astro

Props: `action: string`, `title?: string`, `subtitle?: string`, `buttonText?: string`

- Compact email-only signup form
- Single row: email input + submit button side by side
- Default title: "Stay Updated"
- Background: accent-light or bg-alt
- Can be embedded in footer or used as standalone section

### QuoteRequest.astro

Props: `action: string`, `title?: string`, `services?: string[]`

- Extended contact form for service quotes
- Fields: name, email, phone, service dropdown (populated from `services` prop), budget range dropdown, message textarea
- Service dropdown uses `<select>` element
- Budget ranges: "Under $1,000", "$1,000 - $5,000", "$5,000 - $10,000", "$10,000+"
- Two-column layout on desktop (name/email row, phone/service row), single column mobile

### PricingTable.astro

Props: `title?: string`, `plans: Array<{ name: string; price: string; period?: string; features: string[]; ctaText: string; ctaHref: string; highlighted?: boolean }>`

- Side-by-side pricing cards
- Highlighted plan: accent border, "Popular" badge, slightly larger/elevated
- Each card: plan name, price (large), period (e.g., "/month"), feature list with checkmarks, CTA button
- Checkmark: Unicode check character styled with accent color
- Responsive: cards stack vertically on mobile

### PricingCards.astro

Props: `title?: string`, `cards: Array<{ name: string; price: string; description: string; features: string[]; ctaText: string; ctaHref: string }>`

- Simpler pricing display (no highlight/badge)
- Horizontal cards with equal width
- Each card: name, price, description, feature bullets, CTA
- Good for service packages, membership tiers
- Responsive: single column on mobile

**Commit after all 4:**
```bash
git add src/components/forms/ src/components/pricing/
git commit -m "feat: add NewsletterSignup, QuoteRequest, PricingTable, PricingCards components"
```

---

## Task 6: Integrations (3 components)

**Files:**
- Create: `src/components/integrations/CalEmbed.astro`
- Create: `src/components/integrations/StripeButton.astro`
- Create: `src/components/integrations/MapEmbed.astro`

### CalEmbed.astro

Props: `calLink: string`, `title?: string`, `subtitle?: string`

- Embeds Cal.com scheduling widget via iframe
- `calLink` is the Cal.com booking URL (e.g., "https://cal.com/username/30min")
- Section wrapper with title/subtitle above
- Iframe: full width, fixed height (600px desktop, 500px mobile)
- Loading state: background color while iframe loads
- `loading="lazy"` attribute on iframe

### StripeButton.astro

Props: `href: string`, `text?: string`, `price?: string`, `variant?: 'primary' | 'accent'`

- Styled link button that points to a Stripe Checkout link or Stripe Payment Link
- Shows button text + optional price tag
- Not an actual Stripe integration — just a styled `<a>` tag pointing to a Stripe URL
- Variants control background color
- Default text: "Buy Now"

### MapEmbed.astro

Props: `embedUrl: string`, `title?: string`, `height?: string`

- Google Maps embed via iframe
- `embedUrl` is the Google Maps embed URL
- Section wrapper with optional title
- Responsive: full width, configurable height (default: 400px)
- Rounded corners on iframe
- `loading="lazy"` attribute

**Commit after all 3:**
```bash
git add src/components/integrations/
git commit -m "feat: add CalEmbed, StripeButton, MapEmbed integration components"
```

---

## Task 7: Demo Pages + Types Update + Push

**Files:**
- Modify: `src/lib/types.ts` (add PricingPlan, FAQItem, Logo types if needed)
- Create: `src/pages/services.astro`
- Create: `src/pages/about.astro`
- Create: `src/pages/blog.astro`
- Create: `src/pages/contact.astro`
- Modify: `src/pages/index.astro` (add more sections)

### Update types.ts

Add any missing types for new components:

```typescript
export interface PricingPlan {
  name: string
  price: string
  period?: string
  features: string[]
  ctaText: string
  ctaHref: string
  highlighted?: boolean
}

export interface FAQItem {
  question: string
  answer: string
}
```

### Demo Pages

Create 4 inner pages using the new components with med spa demo data:

**services.astro:** HeroMinimal + FeatureAlternating (3 services with images) + PricingTable (3 plans) + CTABanner

**about.astro:** HeroMinimal + TeamGrid (4 team members) + StatsBar (4 stats) + TestimonialSingle + CTABanner

**blog.astro:** HeroMinimal + BlogGrid (6 demo posts, 3 columns)

**contact.astro:** HeroMinimal + ContactForm (existing) + MapEmbed + CalEmbed

**Update index.astro:** Add LogoCloud, StatsBar, CTABanner sections to the existing homepage between existing components.

### Build + Commit + Push

```bash
cd ~/agency-starter
npm run build
git add src/lib/types.ts src/pages/
git commit -m "feat: add demo pages (services, about, blog, contact) showcasing full component library"
git push
```

---

## Summary

After completing all 7 tasks:

- **31 total components** across 9 categories
- **5 demo pages** (home, services, about, blog, contact)
- Every component uses CSS custom properties exclusively
- Every component has `data-vf-*` attributes for future scoped editor
- Static build works end-to-end
- Pushed to GitHub
