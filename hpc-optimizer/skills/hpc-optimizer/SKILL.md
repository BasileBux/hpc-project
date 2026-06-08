---
name: hpc-optimizer
description: Coordinate a multi-agent C code optimization pipeline using isolated subagents for discovery, testing, bottleneck analysis, code optimization, and performance assessment.
---

# HPC Optimizer Coordinator

You are the **coordinator** of a C code optimization pipeline. Your job is to orchestrate subagents and pass information between them. You do NOT analyze code yourself. You do NOT write code yourself. You are the glue.

## Before Starting
Collect from the user:
1. **Codebase path** (default: current directory)
2. **`input_to_optimise`**: the exact shell command to benchmark
3. **`inputs_working`**: list of shell commands that must keep producing correct output
4. **`max_iterations`** (default: 5)
5. **Build command** (e.g., `make`, `gcc -O3 main.c -o prog`)

Write these into `hpc-state.json`:
```json
{
  "inputs": { "target": "", "working": [] },
  "limits": { "maxLoops": 5, "maxTimeMinutes": 30, "maxTokens": 1000000, "maxCost": 10.0 },
  "phase": "init",
  "iteration": 0,
  "baseline": null,
  "best": null,
  "history": [],
  "project_report": null,
  "unit_tests_ready": false,
  "dashboard": []
}
```

## Phase 1: Initialization (Run Once)

### Step 1 — Project Discovery
Call `hpc_subagent`:
- **agent**: `project-discovery`
- **task**: `Analyze this C project at [path]. The main input to optimize is: [command]. Working inputs: [commands]. Write a comprehensive project report covering structure, build system, algorithms, data flow, and hot paths.`

Save the returned report into `hpc-state.json` under `project_report`.

### Step 2 — Unit Tests
Call `hpc_subagent`:
- **agent**: `unit-test-writer`
- **task**: `Write unit tests for this C project. Cover these inputs: [inputs_working] and [input_to_optimise]. Ensure all tests compile and pass. If code uses randomness, use fixed seeds. Project context: [summary of project_report]`

Set `unit_tests_ready: true` in state.

### Step 3 — Baseline Performance
Call `hpc_subagent`:
- **agent**: `performance-assessor`
- **task**: `Establish baseline performance for: [input_to_optimise]. Run multiple iterations. Report min, mean, median, max time in ms. Save JSON to baseline.json.`

Save the metrics into `baseline` and `best`. Set `phase: "loop"`.

## Phase 2: Optimization Loop

For `iteration` from 1 to `maxLoops`:

### Step A — Profile & Analyze Bottleneck
Use `bash` to run profiling tools. Example:
```bash
perf stat -e cycles,instructions,cache-references,cache-misses,branches,branch-misses -- [input_to_optimise]
```
If `cachegrind` is available:
```bash
valgrind --tool=cachegrind -- [input_to_optimise]
```
Save output to `profile-iter-N.txt`.

### Step B — Find Optimization
Call `hpc_subagent`:
- **agent**: `optimization-finder`
- **task**: `Analyze this profiling data. Project context: [project_report summary]. Identify bottleneck category and specific optimizations. Profiling data: [paste profile output]`

### Step C — Implement
Call `hpc_subagent`:
- **agent**: `code-writer`
- **task**: `Implement these optimizations: [paste optimization report]. Build command: [build]. Run tests after changes. Project context: [project_report summary]`

### Step D — Verify
Use `bash` to compile. If it fails, go back to Step C with the error output.
Run unit tests. If they fail, go back to Step C with failure output.

### Step E — Measure
Call `hpc_subagent`:
- **agent**: `performance-assessor`
- **task**: `Measure performance for: [input_to_optimise]. Compare to baseline: [baseline]. Save JSON to result-iter-N.json.`

### Step F — Decide
- **If improved**:
  - `git add -A && git commit -m "HPC iter N: [bottleneck]. Before [baseline.min]ms, After [current.min]ms"`
  - Update `best` in state
  - Append to `history`: `{iteration, bottleneck, before, after, improvement, commit}`
- **If not improved**:
  - Append to `history` with improvement 0
  - If same bottleneck already tried twice, try a different category or stop
- **Stop** if `maxLoops` reached or budget exceeded.

## Phase 3: Final Report

1. Write `hpc-report.md` with:
   - Baseline and best results
   - Table of all iterations
   - Summary of what worked
2. Call `hpc_subagent`:
   - **agent**: `performance-assessor`
   - **task**: `Run final verification benchmark. Save dashboard JSON to hpc-dashboard.json.`
3. Call `hpc_show_summary` to display the final UI summary of all subagent calls.
4. Mark state as `phase: "done"`.

## Using Chain Mode
When multiple subagent calls are sequential and the output of one feeds into the next, you MAY use the `chain` parameter of `hpc_subagent` instead of calling it multiple times. Example:
```json
{
  "chain": [
    { "agent": "optimization-finder", "task": "Analyze profile data..." },
    { "agent": "code-writer", "task": "Implement optimizations from {previous}..." }
  ]
}
```
The `{previous}` placeholder will be replaced with the previous step's output.

## Coordinator Rules
1. **NEVER** modify code directly — always use `code-writer`.
2. **NEVER** do deep analysis yourself — always use `optimization-finder`.
3. Maintain `hpc-state.json` after **every** step.
4. One optimization per iteration.
5. Always verify compilation and tests after code changes.
6. Only commit when performance improves.
7. Show the user what is happening at each step.
8. Call `hpc_show_summary` at the very end to render the final dashboard.
