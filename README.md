# Chisomo Mbewe · e-portfolio

A static site with no runtime build step: `index.html`, 20 project pages in `projects/`, `styles.css`, `main.js` (interactions and the skills map), `bg.js` (the WebGL particle background, using three.js from jsDelivr), and images in `assets/img/<project>/`. The public CV is `assets/Chisomo_Mbewe_CV.pdf`.

## Editing content

The pages are generated from one data file, so edit the data rather than the HTML:

1. Change text, metrics, links or gallery captions in `../eportfolio-src/content.py`.
2. Rebuild:

```bash
python eportfolio-src/build.py
```

- To add images, add a line to the `JOBS` list in `eportfolio-src/assets.py` and run it. It writes WebP files and `manifest.json`, which supplies image sizes. The script reads from temporary capture folders, so for new images point it at your own files.
- Featured projects have `"featured": True`; everything else appears in the archive.
- Styling is in `styles.css`. The theme tokens are at the top.
- Particle shapes per section are set with `data-shape` attributes in `build.py` (sphere, helix, wave, circuit, torus, galaxy).
- The skills map links come from `SKILL_MAP` in `content.py`.

## Preview locally

```bash
python -m http.server 5173 --directory eportfolio
```

## Deploy to GitHub Pages

1. Copy the contents of this folder into the root of your Pages repo (for example `JohnMbewe04.github.io`).
2. Commit and push, then in the repo go to **Settings → Pages** and serve from `main`.
