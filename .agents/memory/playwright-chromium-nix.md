---
name: Playwright Chromium on Nix
description: Browser-test runtime requirements in this Replit Nix environment.
---

Playwright's downloaded Chromium is not self-contained in this Nix environment; browser tests need the required shared libraries available through the Replit Nix package configuration before Chromium can start.

**Why:** Installing the JavaScript Playwright package and downloading its browser does not provide Linux shared libraries such as GLib, NSPR/NSS, X11, accessibility, audio, and GBM dependencies.

**How to apply:** When adding or restoring Playwright browser tests, validate the Chromium binary in the target environment before treating a test failure as an application bug. Keep the corresponding Nix runtime dependencies available so the checked-in test command works in a fresh Replit environment.