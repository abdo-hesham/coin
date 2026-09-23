# Still Carried

A scroll-driven landing page about one Romanian heirloom coin. The idea behind it: Romanian culture survives because every generation leaves something behind for the next.

A single 3D coin travels through the whole page. It lands on anchors in each section, and the story text parts around it as you scroll.

## Stack

- Plain HTML, CSS and JavaScript (ES modules). There is no build step.
- [GSAP](https://gsap.com/) and ScrollTrigger drive the scroll animations and the pinned sections.
- [Lenis](https://lenis.darkroom.engineering/) provides the smooth scrolling.
- [Three.js](https://threejs.org/) renders the coin. If WebGL is unavailable, the page falls back to a CSS 3D coin.

All libraries load from jsDelivr.

## Run locally

Serve the folder over HTTP; ES modules do not load from `file://`:

```bash
python -m http.server 5178
```

Then open http://localhost:5178.

## Files

- `index.html`: markup, preloader, and the import map for Three.js
- `style.css`: layout, plus the tablet (≤1024px) and phone (≤760px) layouts
- `main.js`: smooth scroll, scroll scenes, the coin's path and preloader, and the story text flowing around the coin
- `coin3d.js`: the WebGL coin
- `assets/`: optimised WebP images
