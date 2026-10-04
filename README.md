# CyberSec Game

A game that teaches cybersecurity by doing it. You sit at a realistic, fully simulated terminal and solve hands-on challenges, starting from zero background and ramping up to problems that challenge experienced engineers.

Everything is simulated: no real servers, no setup, nothing to configure. It runs as a desktop app on macOS and Windows, and in the browser.

## Status

Under construction. Challenge 1, "First Day on the Box" (Linux basics, hidden files and leaked credentials), is being built on the `challenge/01-first-day` branch. `main` only receives fully tested versions.

## Play it

- **In the browser:** once a version is released, it is published to GitHub Pages at https://senorbulks.github.io/CyberSec-Game/.
- **On your computer:** download the installer for your system from the [Releases](https://github.com/SenorBULKS/CyberSec-Game/releases) page.
  - **macOS** (`.dmg`, Apple Silicon and Intel): open the file and drag CyberSec Game into Applications. The app is not signed with a paid Apple developer account yet, so the first time macOS says it "cannot verify the developer". Right-click (or Control-click) the app in Applications, choose **Open**, then **Open** again. On recent macOS versions you may instead need to go to System Settings, Privacy & Security, and click **Open Anyway**.
  - **Windows** (`.msi` or `-setup.exe`): run the installer. If SmartScreen warns about an unrecognized app, click **More info**, then **Run anyway**.

Your progress is saved on your own computer, in the browser or the app. Nothing is sent anywhere.

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

The desktop app is a [Tauri 2](https://tauri.app) window around the same web build. To build it yourself you need Rust and your platform's [Tauri prerequisites](https://tauri.app/start/prerequisites/):

```sh
npm run desktop:build   # installer for the computer you run it on, in src-tauri/target/
```

GitHub Actions builds the macOS and Windows installers (`desktop.yml`) and publishes the web version from `main` (`pages.yml`). The app icon's source is `public/icon.svg`; after changing it, run `node scripts/render-icon.mjs && npx tauri icon src-tauri/app-icon.png`.
