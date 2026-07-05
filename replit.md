# Flutter APK Builder

## Overview

A web app where you paste a Flutter project's Git repository URL and it clones, prepares, and builds a release APK for you, then gives you a download button once the build finishes.

## User Preferences

Preferred communication style: Simple, everyday language.
No code comments should be added to the source code.

## System Architecture

**Backend** (`server.js`)
- Express server, static file serving from `public/`
- `POST /api/build` — starts a background job that clones the repo, runs `flutter create .`, `flutter pub get`, then `flutter build apk --release --target-platform android-arm`
- `GET /api/status/:jobId` — polling endpoint returning current stage, log output, and completion state
- `GET /api/download/:jobId` — streams the built `app-release.apk` once the job succeeds
- Jobs and logs are kept in memory (`Map`); build artifacts live under `builds/<jobId>/repo`

**Frontend** (`public/`)
- `index.html` / `style.css` / `script.js`
- Card/box-based dark UI: URL input box, 4-step progress boxes (Clone, Prepare, Dependencies, Build), status box with progress bar, live log box
- Polls `/api/status/:jobId` every 1.5s and reveals a download button when the build succeeds

**Dockerfile**
- Ubuntu 22.04 base with git, unzip, OpenJDK 17, Node.js 20
- Installs the Flutter SDK (stable) and Android command-line tools/SDK (`platform-tools`, `platforms;android-36`, `build-tools;28.0.3`)
- Installs npm deps and runs `node server.js` on port 5000
- Required because the Replit dev sandbox does not have Flutter/Android SDK installed — building APKs only works when run via this Docker image (or an environment with Flutter installed)

## Notes

- The in-sandbox `Start application` workflow serves the UI/API but cannot actually complete builds since Flutter isn't installed here; use the Dockerfile to run a fully capable environment.
