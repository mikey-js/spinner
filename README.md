# Classroom Check-In Wheel

A standalone spin-the-wheel for classroom check-ins, built for static hosting (GitHub Pages). No ads, no backend, no server-side storage - fonts and the default wheel are local.

## Features

- Midnight theme, radial wheel texture, top pointer
- Fair spins via `crypto.getRandomValues`
- Winner overlay, star confetti, synthesized tick/win sounds
- Active / removed entry board with drag-and-drop
- Wheel library (new, duplicate, import/export)
- Share via compressed `#w=` URL + QR code
- Persistence in `localStorage`

## Run locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` (needs HTTP, not `file://`).

First visit with an empty cache creates a blank **Untitled** wheel. Open `/default/` for the classroom check-in wheel (or any `#w=` share link).

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings -> Pages -> Build and deployment**
3. Source: **Deploy from a branch**
4. Branch: `main` / folder: `/ (root)`
5. Visit `https://<user>.github.io/<repo>/`

## Data & storage

| Piece | Where |
| --- | --- |
| Built-in classroom wheel token | `js/default-share-token.js` |
| Install via URL | `/default/` -> redirects to `#w=<token>` (sets default) |
| Wheel library | `localStorage` key `spinner.library.v2` |
| Share links | `#w=` hash (deflate + base64url) - no server |

A fresh browser with an empty cache gets a blank **Untitled** wheel. Visit `/default/` (or any `#w=` share link) to open that wheel **for the current visit only** - it is not cached. Use **Duplicate** to save it into Your wheels.
