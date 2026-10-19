# How airborne lidar works

An interactive field guide to galvo-based, time-of-flight airborne lidar, drawn as isometric SVG with WebGL.

**[Open the guide](https://sguergachi-tdy.github.io/airborne-lidar/)** · [light theme](https://sguergachi-tdy.github.io/airborne-lidar/lidar-light.html)

- **Figure 1:** a survey aircraft with its fuselage cut away, firing pulses at the ground in bullet time, with the navigation computer's live waveform.
- **Figure 2:** the sensor head on its optical bench, with swappable scanners (galvo, polygon, Palmer, Risley, flash), lasers, receivers and navigation, and the ground pattern each one draws.
- **Figure 3:** boresight calibration on a bench.
- Eleven chapters with animated equation drawings: ranging, maximum range and PRF, swath, line spacing, point density and georeferencing.

## Build

The pages are standalone HTML files; `lidar.html` and `lidar-light.html` are committed and need no build to view.

To rebuild them you need Node 20+ and the anatomy skill's kit. The build looks for it in `~/.agents/skills/anatomy`, or wherever `ANATOMY_SKILL` points.

```sh
node build.mjs          # writes lidar.html (dark, follows the system theme)
node build.mjs --light  # writes lidar-light.html
```

Made with Claude Code and Claude Opus 5.5.
