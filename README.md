# CyberSec Game

A game that teaches cybersecurity by doing it. You sit at a realistic, fully simulated terminal and solve hands-on challenges, starting from zero background and ramping up to problems that challenge experienced engineers.

Everything is simulated: no real servers, no setup, nothing to configure. It runs as a desktop app on macOS and Windows, and in the browser.

## Status

Under construction. Challenge 1, "First Day on the Box" (Linux basics, hidden files and leaked credentials), is being built on the `challenge/01-first-day` branch. `main` only receives fully tested versions.

## License

MIT, see [LICENSE](LICENSE).

## Development

Requires Node.js 22.

```sh
npm install
npm run dev          # play locally at http://localhost:5173
npm test             # unit tests
npm run test:e2e     # plays the game in a real browser (Playwright)
npm run build        # production build in dist/
npm run build:preview  # the whole game as one HTML file in dist-single/
```
