# Interactive visualization

From the `Chaos-control-and-schedule-of-shuttle-buses` directory, run:

```bash
python -m http.server 8000
```

Then open:

<http://localhost:8000/visualization/>

The page is a self-contained simulation workbench with no external JavaScript
or CSS dependencies. It reimplements the two-bus event loop in the browser and
provides:

- an animated origin–destination shuttle route;
- live passenger accumulation, loading, unloading, and overtaking;
- interactive loading and speedup controls plus playback controls;
- paper presets for regular, period-11, and chaotic motion;
- headway and tour-time traces;
- the bus-1 return map;
- late-time mean and RMS statistics.
