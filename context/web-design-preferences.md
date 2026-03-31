# Web Design Preferences — Michael Charles (StudioX)

> Upload this file to any new Claude project. It contains everything Claude needs to build websites the way Michael likes them — no prior context required.

---

## Who This Is For

Michael Charles runs **StudioX**, a design company. One division builds websites for real estate agents. This document captures Michael's web design philosophy, aesthetic preferences, technical stack, and quality standards so that any Claude instance can produce work aligned with his taste from the first draft.

---

## Design Philosophy

Michael's design philosophy is rooted in the **Bauhaus movement**: form follows function, geometric clarity, reduction to essentials. Every design decision should serve a purpose. If an element doesn't earn its place, remove it.

Core beliefs:

- **Content is the hero** — let the product, property, or subject matter dominate. No decorative clutter competing for attention.
- **Skeleton first, customisation second** — build a strong, reusable structural foundation, then layer client-specific branding on top. Don't reinvent the structure per project.
- **Infer first, ask second** — use whatever context is available (brief, conversation history, client data) to make creative decisions before asking Michael questions. Only ask when something is genuinely ambiguous and can't be reasonably inferred.
- **Photos sell** — especially for real estate. Websites should be image-forward. Give photography maximum breathing room.
- **Proposal quality matters** — even a first-pass proposal should feel polished enough to impress a client. It doesn't need to be production-perfect, but it needs to look professional.

---

## Visual Style

### What Michael Gravitates Toward

Michael admires Apple's design language and has studied their advertising in detail. The principles he draws from:

- **Minimalist composition** — clean, uncluttered layouts with generous whitespace. Every element has breathing room.
- **Bold typography** — strong, blocky display type for headlines. All-caps for impact. Short, declarative copy — fragments over full sentences ("Vapour-cooled. Lightning-fast." not "This product is vapour-cooled and lightning-fast.").
- **High contrast** — dark backgrounds with white or near-white text for premium feel. No mid-tone text on mid-tone backgrounds.
- **Two-mode palette system** — dark/premium mode (deep blacks, dark navy) for high-end or feature-focused content, and clean white mode for accessible, inviting content like product lineups or pricing.
- **Restrained branding** — logos appear small. Brand colors are used as accents, not dominant fills. The content speaks, not the chrome.
- **Cinematic quality** — imagery should feel editorial, not stock. Professional photography, not clip art or generic illustrations.
- **Confident, understated CTAs** — "Learn more", "View listings", "Get in touch". Never aggressive ("BUY NOW", "ACT FAST", "DON'T MISS OUT").
- **Template-driven consistency** — repeatable layout patterns across pages build brand recognition. Consistency over novelty.

### Color Palette Defaults

When no client branding is provided, use these real estate industry defaults:

| Role | Color | Hex |
|---|---|---|
| Primary | Navy | `#1B2A4A` |
| Secondary | Gold | `#C4953A` |
| Background | White | `#FFFFFF` |
| Text | Dark gray | `#1F2937` |
| Accent | Light gray | `#F3F4F6` |
| Dark premium BG | Near-black | `#0A0A0A` |
| Dark premium BG alt | Dark navy | `#1A1A2E` |

When a client has visible branding (logo, cover photo), pull colors from those assets instead. The defaults are a fallback.

### Typography

- **Headings**: Clean sans-serif — Inter or Montserrat. Bold weight. Clear hierarchy (h1 noticeably larger than h2, etc.).
- **Body**: Inter or equivalent system sans-serif. Regular weight. Readable line height and spacing.
- **Display/hero text**: Bold, potentially all-caps for impact headlines. Short copy — one sentence max in hero sections.
- No decorative or novelty fonts unless the client's brand explicitly uses them.

### Layout Principles

- **Mobile-first responsive design** — layouts built for mobile first, then expanded for tablet and desktop.
- **Card-based layouts** for collections (property listings, team members, services). Each card is a self-contained unit: image on top, info below, clear click target.
- **Full-viewport hero sections** — background image with dark overlay, centered white text, single CTA button.
- **Generous whitespace** — never more than 2-3 lines of text above a creative element. Let content breathe.
- **Centered or slightly offset compositions** — for hero images and featured content.
- **Grid systems** — 1 column mobile, 2 columns tablet, 3 columns desktop for card grids.
- **Sticky navigation** — business name as text logo (left), nav links (right), hamburger menu on mobile with slide-out drawer.
- **Dark footer** — contact info, social links, copyright with dynamic year, service area text.

---

## Technical Stack

### Preferred Framework

**Next.js 14+** with the App Router and **Tailwind CSS**. This is the standard stack for all website projects.

Configuration:

- `output: 'export'` for static sites (deployable anywhere, no server needed)
- `images: { unoptimized: true }` for static export compatibility
- `trailingSlash: true`
- Tailwind with custom color palette in `tailwind.config.js`
- PostCSS + Autoprefixer
- Google Fonts imported in `layout.js` (Inter for body, Montserrat for headings)

### Deployment

- **GitHub** for source control (`gh repo create` with `--public`)
- **Vercel** for hosting (connect repo or use Vercel CLI)
- Sites should build cleanly with `npm run build` — zero errors, zero warnings

### Project Structure

```
{project-name}/
├── package.json
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
├── jsconfig.json
├── .gitignore
├── README.md
├── site-data.json              # Data layer — all content lives here
├── public/
│   └── images/                 # All site images
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.js           # Root layout with fonts, metadata
│   │   ├── page.js             # Homepage
│   │   ├── listings/           # (or equivalent collection pages)
│   │   │   ├── page.js
│   │   │   └── [id]/
│   │   │       └── page.js
│   │   ├── about/
│   │   │   └── page.js
│   │   └── contact/
│   │       └── page.js
│   ├── components/
│   │   ├── Navbar.js
│   │   ├── Footer.js
│   │   ├── HeroSection.js
│   │   └── ...                 # Domain-specific components
│   └── lib/
│       └── data.js             # Functions that read from site-data.json
```

### Data Architecture

All site content is driven by a single `site-data.json` file at the project root. The `src/lib/data.js` module exports accessor functions (`getAllListings()`, `getBusinessInfo()`, etc.) that read from this JSON. This keeps content separate from presentation and makes the site easy to update without touching components.

---

## Real Estate Website Specifics

Michael's real estate division has a standardised website structure. Every real estate site follows this pattern:

### Required Pages

1. **Homepage** (`/`)
   - Hero section: full-width background image, business name as h1, tagline, CTA button ("View Listings")
   - Featured listings: grid of 3 top properties with photos, prices, quick details
   - About snippet: 2-3 sentences with "Learn More" link
   - Contact CTA: phone, email, "Get in Touch" button

2. **Listings page** (`/listings`)
   - Page title: "Available Properties"
   - Responsive grid of all property cards
   - Each card: photo with price badge overlay (top-right), address as title, beds/baths/sqft icon row, status pill (green = For Sale, yellow = Pending, gray = Sold)

3. **Individual listing pages** (`/listings/[id]`)
   - Full-width property photo
   - Price and status badge prominently displayed
   - Property details: beds, baths, sqft in an icon row
   - Features as pill/badge list
   - Full description
   - "Contact About This Property" CTA

4. **About page** (`/about`)
   - Agent/agency profile photo
   - Full about text
   - Service area with geographic context
   - Social media link

5. **Contact page** (`/contact`)
   - Contact form: name, email, phone, message, property interest dropdown
   - Client-side validation (required fields, email format)
   - Direct contact sidebar: phone (tel: link), email (mailto: link), address
   - Office hours if available

### Component Patterns

- **Navbar**: Sticky top. Business name as text logo (left), nav links (right). Hamburger + slide-out drawer on mobile.
- **Footer**: Dark background. Contact info, social links, copyright with `new Date().getFullYear()`, service area.
- **HeroSection**: Full viewport height. Background image with dark overlay (semi-transparent black). Centered white text. Single CTA button.
- **ListingCard**: Image with price badge overlay top-right. Address as title. Beds/baths/sqft icon row. Status pill. Entire card clickable to detail page.
- **ContactForm**: Controlled component with `useState`. Validation on submit. Success state message after submit (no backend needed for proposals).

### Geographic Personalisation

Every real estate site should feel locally rooted, not template-y. Use the agent's real location data throughout: city name in headlines, service area in the footer, geographic context in meta descriptions and SEO metadata. This is a key differentiator.

---

## Content & Messaging Tone

- **Professional but approachable** — match the voice the agent uses in their own materials
- **Confident, not pushy** — state what the business offers. Don't plead or create false urgency.
- **Feature-first copy** — describe what's available, let the reader determine value. "3-bedroom waterfront condo with updated kitchen" not "You won't believe this AMAZING deal!"
- **Short copy** — hero taglines are one sentence max. Listing descriptions are concise. Body text is scannable.
- **Declarative fragments over full sentences** in headlines and taglines — "Your home in Miami." not "We help you find your dream home in the beautiful city of Miami."
- **Soft CTAs** — "View listings", "Learn more", "Get in touch", "Contact us". Never "ACT NOW" or "CALL TODAY".

---

## SEO & Metadata

Every page must include:

- Proper `<title>` using business name and page purpose
- `<meta name="description">` with business name + location + service
- Semantic HTML: proper heading hierarchy (one h1 per page), landmarks, alt text on images
- Open Graph tags for social sharing (at minimum: title, description, image)

---

## Quality Checklist

Before presenting any website to Michael, verify:

- [ ] `npm run build` completes with zero errors
- [ ] All images render correctly
- [ ] Site is responsive at 375px (mobile), 768px (tablet), 1280px (desktop)
- [ ] All internal links work (no broken routes)
- [ ] Navigation works on every page
- [ ] Contact form validates required fields client-side
- [ ] Color contrast meets basic accessibility standards (no light text on light backgrounds)
- [ ] Fonts load correctly
- [ ] Footer has current year and correct business info

---

## Process Preferences

- **Full regeneration over patches** — when Michael gives feedback, rebuild the design from scratch incorporating all notes. Don't try to patch individual elements.
- **Preserve all drafts** — never delete or overwrite a previous version. Every iteration should be saved.
- **No revision cap** — iterate until Michael approves. Don't rush to "final".
- **Show creative rationale** — when presenting a design, include 2-3 sentences explaining key decisions (color, layout, typography) and how they connect to the brief or client data.
- **Infer, then validate** — make design decisions based on available context, present them with rationale, and let Michael redirect if needed. This is faster than asking questions upfront for every decision.

---

## What NOT to Do

- No stock imagery aesthetic — everything should feel real and specific to the client
- No decorative clutter — no starbursts, badges, or "LIMITED TIME" overlays
- No aggressive sales language — no all-caps urgency, no exclamation marks in CTAs
- No mid-tone-on-mid-tone color combinations — always ensure strong contrast
- No lifestyle photography in hero sections unless it's the client's own photography — let the property or business be the hero
- No novelty fonts
- No heavy UI chrome — keep interfaces clean and minimal
