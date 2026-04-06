# Motion Master for Premiere Pro UXP

Motion Master is now a pure UXP v8.1 panel for Premiere Pro v25.6+.
The panel applies 30 Motion presets directly through `require("premierepro")` with no CEP, no ExtendScript, and no `evalScript`.

## Requirements

- Premiere Pro `25.6.0` or newer
- Adobe UXP Developer Tool `v2.2.1` or newer
- Node.js `20+`

## Development

```bash
cd premiere-motion-extension
npm install
npm run build
```

Load the generated `build/` folder in UDT.

1. Open Adobe UXP Developer Tool.
2. Choose `Add Plugin`.
3. Select `premiere-motion-extension/build/manifest.json`.
4. Launch Premiere Pro and open the `Motion Master` panel.

## Packaging

`npm run package` builds the panel and then calls Adobe UDT to create a `.ccx` package.

If UDT is not on your `PATH`, set one of these before packaging:

```bash
export UDT_PATH="/Applications/Adobe UXP Developer Tool.app/Contents/MacOS/Adobe UXP Developer Tool"
```

The package script writes output into `releases/`.

## Features

- 21 pan/zoom presets and 9 motion-effect presets
- Real-time selected-clip sync through Premiere UXP events
- Smart random assignment with anchor and intensity heuristics
- Focal-point detection from stills and video frames
- Transaction-safe Motion keyframes for Scale, Position, and Rotation
- Session-baseline restore for non-destructive undo inside the panel

## File Layout

```text
premiere-motion-extension/
├── build/
├── icons/
├── scripts/
├── src/
├── index.html
├── manifest.json
├── package.json
└── tsconfig.json
```

## Notes

- `icons/` currently contains placeholder PNG assets. Replace them before marketplace submission.
- The panel is designed for the Premiere dark UI and a default docked size of `380 × 700`.
- `scripts/build.sh` keeps `premierepro` and `uxp` external so Premiere provides them at runtime.
