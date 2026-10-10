# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-10-10

- Build and parse Czech QR payment strings (SPAYD / QR Platba) per ČBA standard v1.2.
- Correct escaping, field length limits, amount formatting and optional CRC32.
- Domestic account ↔ IBAN helpers for payment payloads.
- Zero runtime dependencies; ESM and CJS builds with TypeScript types.

[Unreleased]: https://github.com/gildor853/cz-qr-platba/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/gildor853/cz-qr-platba/releases/tag/v1.0.0
