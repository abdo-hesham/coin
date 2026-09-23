# Still Carried

A scroll-driven landing page about one Romanian heirloom coin. The idea behind it: Romanian culture survives because every generation leaves something behind for the next.

A single 3D coin travels through the whole page. It lands on anchors in each section, and the story text parts around it as you scroll.

## Stack

- Plain HTML, CSS and JavaScript (ES modules). There is no build step.
- [GSAP](https://gsap.com/) and ScrollTrigger drive the scroll animations and the pinned sections.
- [Lenis](https://lenis.darkroom.engineering/) provides the smooth scrolling.
- [Three.js](https://threejs.org/) renders the coin. The page starts with a lightweight CSS 3D coin and switches to the WebGL coin after the visitor's first interaction. If WebGL is unavailable, the CSS coin stays.

The libraries are self-hosted in `vendor/`, so the page makes no third-party script requests.

## Performance

- CSS is inlined in `index.html`, and the fonts are self-hosted, subset to the characters the page uses.
- The first screen needs only the HTML, one font, the loader coin and the hero's largest image.
- Scripts and the remaining hero art start after the first paint. The loader coin spins with CSS until then.
- Phones get smaller image variants through `srcset`, and images below the fold load once scrolling starts.
- `vercel.json` and `_headers` set long cache lifetimes on Vercel or Netlify.
- Mobile Lighthouse, measured locally: Performance 94–96, and 100 for Accessibility, Best Practices and SEO.

## Run locally

Serve the folder over HTTP; ES modules do not load from `file://`:

```bash
python -m http.server 5178
```

Then open http://localhost:5178.

## Files

- `index.html`: markup, all styles (including the tablet ≤1024px and phone ≤760px layouts), the preloader, the script bootstrap, and the import map for Three.js
- `main.js`: smooth scroll, scroll scenes, the coin's path and preloader, and the story text flowing around the coin
- `coin3d.js`: the WebGL coin
- `assets/`: optimised WebP images, with smaller variants for phones
- `vendor/`: GSAP, ScrollTrigger, Lenis and Three.js
- `fonts/`: Newsreader, Inter and Pinyon Script (subset WOFF2)
