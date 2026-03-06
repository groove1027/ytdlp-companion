# Ralph Agent Configuration

## Build Instructions

```bash
# TypeScript compilation check (MUST pass with 0 errors)
cd /Users/jihoo/Downloads/all-in-one-production-claudecode/src && npx tsc --noEmit

# Full production build
cd /Users/jihoo/Downloads/all-in-one-production-claudecode/src && npm run build
```

## Test Instructions

```bash
# No unit test framework configured yet.
# Verification = tsc --noEmit + npm run build success
cd /Users/jihoo/Downloads/all-in-one-production-claudecode/src && npx tsc --noEmit && npm run build
```

## Run Instructions

```bash
# Development server (localhost:3000)
cd /Users/jihoo/Downloads/all-in-one-production-claudecode/src && npm run dev
```

## Important Notes
- package.json is inside `src/`, NOT project root
- Always use absolute paths or `cd src` before commands
- All fetch calls must use `monitoredFetch` wrapper (apiService.ts)
- New types go in `src/types.ts`
- Stores in `src/stores/` (projectStore, uiStore, costStore)
