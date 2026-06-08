---
name: hpc-optimize
description: Kick off the HPC C code optimization workflow using the 2-agent profiler/optimizer pipeline.
---

Start the HPC optimization workflow for this C project.

**Codebase path**: .
**Input to optimize**: 
**Working inputs**: 
**Max iterations**: 5
**Build command**: make

The workflow uses two agents:
1. **profiler** (cheap model) — runs `perf`, `hyperfine`, `cachegrind`, `clang-tidy` and returns structured metrics.
2. **optimizer** (strong model) — reads the metrics and source code, implements one optimization, compiles, tests, and benchmarks in a single invocation.

Please collect any missing information from me, then run the tight loop.
