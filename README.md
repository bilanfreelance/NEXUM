# NEXUM M1 — Digital Microscope (concept website)

Scroll-driven product story: device → into the lens → microworld → molecular & atomic models → back to the product, specs and CTA.

- Pure HTML / CSS / JS, no build step
- GSAP 3.12 + ScrollTrigger, Lenis smooth scroll
- Three.js: one GPU particle system (44k points) morphing between objective barrel, spore, gyroid, caffeine molecule and hydrogen 3dz² orbital
- Fonts: Archivo Expanded (display), JetBrains Mono (labels)
- `prefers-reduced-motion` → static editorial version of the journey

Concept product for portfolio. Micro images are artistic visualizations; molecule (caffeine) and atom (hydrogen 3dz² |ψ|²) are models, not M1 captures. Specs are placeholders.

Design & development — Valentyn Bilan · bilandesign.site

## v2 (`/v2/`)
Dark-first, everything visual in one WebGL pipeline: particles + DOM-synced image planes, post pass with noise-dissolve page background, bloom, velocity chromatic shift, grain. Loader rings re-form as a halo around the product; cursor repels particles; CTA ends with the halo.
