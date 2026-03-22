# Ralph Agent Configuration

## Build Instructions

```bash
# TypeScript compilation check (MUST pass with 0 errors)
cd /Users/mac_mini/Downloads/all-in-one-production-build4/src && npx tsc --noEmit

# Full production build
cd /Users/mac_mini/Downloads/all-in-one-production-build4/src && npm run build
```

## Test Instructions

```bash
# No unit test framework configured yet.
# Verification = tsc --noEmit + npm run build success
cd /Users/mac_mini/Downloads/all-in-one-production-build4/src && npx tsc --noEmit && npm run build
```

## Run Instructions

```bash
# Development server (localhost:3000)
cd /Users/mac_mini/Downloads/all-in-one-production-build4/src && npm run dev
```

## Important Notes
- package.json is inside `src/`, NOT project root
- Always use absolute paths or `cd src` before commands
- All fetch calls must use `monitoredFetch` wrapper (apiService.ts)
- New types go in `src/types.ts`
- Stores in `src/stores/` (projectStore, uiStore, costStore)
