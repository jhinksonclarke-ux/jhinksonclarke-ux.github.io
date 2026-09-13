# Jordan Hinkson-Clarke | Shader Jay

One-page portfolio for Jordan Hinkson-Clarke, 3D Designer & Visualizer.
Live at <https://jhinksonclarke-ux.github.io/>.

Plain HTML, CSS and JavaScript with no framework, published by GitHub Pages
straight from the `main` branch.

## Adding or changing a project

1. Put the original render in `MEDIA/` (it stays on your machine and is never uploaded).
2. Add an entry to `content/projects.json`: `slug`, `title`, `category`, `year`,
   `image` (the file name in `MEDIA/`), `alt` and `description`.
   The spiral sorts itself newest to oldest by `year`. Pieces from the same year
   appear in the order they're listed.
3. For a video, add it to the list at the top of `tools/encode-videos.mjs`, run
   `node tools/encode-videos.mjs`, then give the project a `video` value matching its `slug` there.
4. Run `npm run build`. It writes the optimised images and updates the cards in `index.html`.
5. Commit and push. GitHub Pages republishes within a minute or two.

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
