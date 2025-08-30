# GX Studio - Agents Guide

## Commands

- `pnpm run typecheck` - TypeScript type checking
- `pnpm start` - Start dev server (builds Rust first)
- `pnpm run build` - Production build (builds Rust + rsbuild)
- `pnpm run build:rust` - Build Rust WASM modules
- `pnpm run build:rust-dev` - Build Rust WASM modules in dev mode

## Architecture

- **Main engine**: Based on noclip.website - 3D game viewer/material editor
- **Frontend**: TypeScript/WebGL2/WebGPU with ImGui UI
- **Build system**: rsbuild (Rspack-based) with TypeScript
- **Rust integration**: WASM modules for performance-critical operations
- **Game support**: 90+ game engines (Nintendo, PlayStation, Xbox, PC)
- **Project structure**: `/src/{GameName}/` for each supported game

## Code Style

- **Imports**: Use `.js` extensions, relative paths like `./ModuleName.js`
- **Classes**: PascalCase, use `export class ClassName` pattern
- **Types**: Strict TypeScript - enable all strict flags in tsconfig
- **Error handling**: Use `assert()` and `assertExists()` from `util.ts`
- **File naming**: PascalCase for classes, camelCase for utilities
- **No comments**: Don't add explanatory comments unless complex/requested
- **WebGL/Graphics**: Use GfxDevice abstraction, not direct WebGL calls
