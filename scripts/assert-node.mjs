// Guard the npm scripts against an unsupported Node.js version.
//
// The toolchain (Vitest 5, jsdom 30, Vite 8) requires a newer Node than some
// environments default to. Without this check that surfaces as a cryptic
// `ERR_REQUIRE_ESM` from html-encoding-sniffer instead of an actionable hint.
// Keep this in sync with `engines` in package.json and `.nvmrc`.
const [major, minor] = process.versions.node.split('.').map(Number)
const supported = (major === 22 && minor >= 22) || (major === 24 && minor >= 15) || major >= 26

if (!supported) {
  console.error(`TWINE requires Node.js ^22.22.2 || ^24.15.0 || >=26.0.0 (found ${process.versions.node}).`)
  console.error('Run `nvm use` in the twine/ directory (see .nvmrc), then re-run this command.')
  process.exit(1)
}
