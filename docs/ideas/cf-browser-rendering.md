**Added:** 2026-03-18
**Status:** Idea
**Category:** Infrastructure / Features

## Summary

Use Cloudflare Browser Rendering for server-side screenshots, URL previews, and AI web scraping. Headless Chrome on CF's edge — no extra infra.

## Details

- Docs: https://developers.cloudflare.com/browser-rendering/
- REST API for simple tasks (screenshots, PDFs, markdown extraction) — no Worker code needed
- Workers binding with Puppeteer/Playwright for complex automation
- Available on Free plan with generous free tier

## Use Cases for VaporForge

1. **Agency Mode screenshots** — server-side renders instead of relying on browser iframe. Better for thumbnails, sharing, og:image
2. **URL previews in chat** — user pastes a URL, render a screenshot or extract structured content
3. **AI web scraping** — JSON endpoint extracts structured data from pages for Claude to work with (docs, API refs)
4. **PDF generation** — export session transcripts or code as formatted PDFs

## Next Steps

- Test REST API with a simple screenshot request from the Worker
- Evaluate latency and quality for Agency Mode preview use case
- Check if it can render localhost (probably not — would need the container's dev server exposed)
