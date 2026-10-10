# Security policy

## Supported versions

Only the `main` branch and the latest `0.x` version receive security fixes.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report it privately through GitHub's private vulnerability reporting:
<https://github.com/gildor853/cz-qr-platba/security/advisories/new>
(repository **Security** tab → **Report a vulnerability**).

Please include the affected version, a minimal input that reproduces the
problem and its impact. You can expect an acknowledgement within 7 days.
Fixes are released as a patch version and credited in the advisory unless you
prefer otherwise.

## Scope

This is a zero-dependency library that processes untrusted strings. Issues
such as incorrect validation results, crashes on crafted input, excessive CPU
or memory use (e.g. super-linear behaviour on long inputs) and prototype
pollution are in scope.

## Disclaimer

This project is provided as is, without warranty. See [DISCLAIMER.md](./DISCLAIMER.md)
for the full disclaimer and limitation of liability.
