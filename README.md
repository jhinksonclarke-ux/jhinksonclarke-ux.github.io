# Jordan Hinkson-Clarke | Shader Jay

One-page portfolio for Jordan Hinkson-Clarke, 3D Designer & Visualizer.
Live at <https://jhinksonclarke-ux.github.io/>.

Plain HTML, CSS and JavaScript with no framework, published by GitHub Pages
straight from the `main` branch.

## Adding or changing a project

1. Put the original render in `MEDIA/` (it stays on your machine and is never uploaded).
2. Add an entry to `content/projects.json`: `slug`, `title`, `category`, `year`,
   `cover` (the file in `MEDIA/` used for the spiral card), `alt` and `description`.
   The spiral sorts itself newest to oldest by `year`. Pieces from the same year
   appear in the order they're listed.
3. To show more than one thing, add a `media` list. Each entry is either
   `{ "image": "FILE.png", "label": "Clay" }` for a still in `MEDIA/`, or
   `{ "video": "slug", "label": "Turntable" }` for an encoded film. The labels become the
   buttons in the project viewer, and any entry can carry its own `alt`.
4. For a film, add it to the list at the top of `tools/encode-videos.mjs`, run
   `node tools/encode-videos.mjs`, then reference that `slug` from `media`. A project made
   only of films needs no `cover`: its card uses the first film's poster frame.
5. Run `npm run build`. It writes the optimised images and updates the cards in `index.html`.
6. Commit and push. GitHub Pages republishes within a minute or two.

To remove a project, delete its entry and run `npm run build`, which also deletes its images.
For a video, also remove it from `tools/encode-videos.mjs` and delete its two files in `assets/video/`.
A discipline's filter only shows while it has at least one project.

Set up once with `npm install`. Video encoding also needs FFmpeg.

## Tools

| Command | What it does |
| --- | --- |
| `npm run build` | Images (AVIF + WebP), logos, icons, and the generated parts of `index.html` |
| `node tools/encode-videos.mjs` | Web-sized films, card loops and poster frames from `MEDIA/` |
| `node tools/subset-fonts.mjs` | Rebuilds the two small Saira font files |
| `npm run serve` | Local preview at <http://localhost:5173> |

## Credits

Typeface: Saira by Omnibus-Type, SIL Open Font License (`assets/fonts/OFL.txt`).
Icons: paths from Lucide (ISC licence).
Client logos belong to their owners. The Olympics are credited in text only.
