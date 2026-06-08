# HPC project

The goal is to build a lean pipeline of agents that can work together to optimize
a C project. The optimization can be targeted and local or more global across a
whole project.

The biggest bottleneck in LLMs is context memory: long conversations are expensive
and older tokens are forgotten. To keep token usage low and context windows tight,
this pipeline uses only **two** specialized subagents:

1. **profiler** — a cheap agent that only runs shell commands and spits out raw
   structured metrics.
2. **optimizer** — a strong agent that reads those metrics, edits source code,
   compiles, tests, and benchmarks all in one go.

The coordinator's only job is to call them in a loop and commit when things get
faster.

## Main idea

![./diagrams/concept.png](./diagrams/concept.png)

The main agent is a lightweight coordinator. It does not analyze code and it does
not write code. It collects user inputs, maintains `hpc-state.json`, and drives
a tight loop:

1. **Init** — run the profiler once to capture baseline metrics.
2. **Loop** (up to N iterations):
   - Call the profiler to get fresh metrics.
   - Hand the metrics to the optimizer, which implements one focused optimization,
     compiles, runs tests, and benchmarks in a single invocation.
   - If the optimizer reports faster + correct results, commit. Otherwise revert.
3. **Report** — summarize gains and render the dashboard.

This removes the coordination overhead of a 5-agent pipeline and keeps the real
work inside the optimizer's own context window.

## Subagents

### profiler

Intelligence level: low (cheap model, e.g. `gpt-4o-mini`)

Runs profiling and benchmarking tools and returns extremely concise, structured
output. It never writes code and never interprets the metrics.

- **Benchmarking**: `hyperfine`
- **Hardware counters**: `perf stat`
- **Cache simulation**: `valgrind --tool=cachegrind`
- **Static analysis**: `clang-tidy`

Output is JSON or bulleted metrics only.

### optimizer

Intelligence level: high (default model)

Reads the profiler's structured output, reads relevant source files, implements
one focused optimization, compiles, tests, and benchmarks — all in one invocation.

- **Reads** source files to understand context.
- **Edits** code incrementally (one optimization at a time).
- **Compiles** with the provided build command.
- **Tests** by diffing outputs of `inputs_working` against expected results.
- **Benchmarks** the `input_to_optimise`.
- **Reports** a concise verdict: faster / slower / unchanged / reverted.

## Details

### User inputs

- C code base (can be more than one file)
- One input to optimise (`input_to_optimise`)
- Working inputs that must keep producing correct output (`inputs_working`)
- Max loops, max time, max tokens, max cost
- Metric to optimise (default: minimum time)

Goal: minimise time used by the algorithm for a fixed input while preserving
correctness on all working inputs.

### Initialization Phase

1. Run the **profiler** on `input_to_optimise` to get baseline metrics
   (min, mean, median, max time).
2. Store baseline in `hpc-state.json`.

### Loop Phase

For each iteration (up to `max_iterations`):

1. **Profile** — call the profiler to get fresh metrics on the current code.
2. **Optimize** — call the optimizer with the profiler data, baseline, build
   command, and input lists. The optimizer does everything in one go:
   - read source,
   - implement one focused optimization,
   - compile,
   - test (diff outputs),
   - benchmark.
3. **Decide** — coordinator checks the optimizer's verdict:
   - **Faster + correct** → commit with a descriptive message, update `best`.
   - **Slower or incorrect** → revert changes, log iteration.
   - **Stop** if max loops reached, budget exceeded, or no improvement for 2
     consecutive iterations.

### Global Rules

1. Use only CPU.
2. Use C code only.
3. No machine-specific optimisations unless requested.
4. No hardcoding results or precomputed lookup tables.
5. Respect max loops, tokens, time, and cost limits.

### Compiler & Build
- **GCC / Clang** — `-g -O2 -fno-omit-frame-pointer` for profiling; `-O3 -march=native` for final benchmarks; PGO and LTO support
- **Compiler diagnostics extractor** — parses warnings, errors, and vectorization remarks into structured JSON

### Time Benchmarking
- **Hyperfine** — cross-platform benchmarking with statistical analysis and JSON export

### Bottleneck Analysis
- **perf stat** — quick hardware counter snapshot (cycles, instructions, branches, branch-misses, cache-references, cache-misses)
- **perf record + FlameGraph** — CPU sampling and numeric summaries

### Cache Analysis
- **Valgrind Cachegrind** — simulates L1/L2/LL cache hierarchy
- **perf cache events** — real hardware counters

### Branch Prediction
- **perf branch events** — branches, branch-misses, branch-loads

### Memory / Heap
- **Valgrind Massif** — heap profiler
- **perf mem record/report** — memory access patterns

### Parallelization
- **perf sched** — thread scheduling analysis

### Static Analysis
- **clang-tidy** — performance and portability anti-pattern detection
- **cppcheck** — fast C static analysis

### Binary Analysis
- **objdump** — disassembly inspection
- **nm** — symbol table with sizes

### Correctness & Testing
- **diff** — output comparison for regression testing
- **Valgrind Memcheck** — memory error detection

### Reporting & Aggregation
- **Benchmark result parser** — compares baseline vs current iteration, calculates improvement %, generates dashboard JSON and commit messages

---

## Pi Package Usage

This repository is a **pi package** that implements the full HPC optimizer workflow.

### Installation

From the repository root:

```bash
# Local install (development)
pi install git:.

# Or load the extension directly for testing
pi -e ./extension/index.ts
```

### Files

| Path | Purpose |
|------|---------|
| `extension/index.ts` | Main extension — registers `hpc_subagent` and `hpc_show_summary` tools, plus `/hpc-summary` command |
| `skills/hpc-optimizer/SKILL.md` | Coordinator skill — tells the main agent exactly how to orchestrate subagents |
| `prompts/hpc-optimize.md` | Prompt template `/hpc-optimize` — kickoff message for the workflow |
| `agents/profiler.md` | Cheap subagent — runs profiling tools and returns structured metrics |
| `agents/optimizer.md` | Strong subagent — reads metrics, implements optimizations, compiles, tests, and benchmarks end-to-end |

### Starting the workflow

Once the package is loaded in pi, you can either:

1. Type `/hpc-optimize` and fill in the inputs.
2. Or simply describe your goal, e.g.:
   > "Optimize my C project. The input to optimize is `./my_program --input large.txt`. Working inputs are `./my_program --input small.txt` and `./my_program --input medium.txt`. Build with `make`."

The coordinator skill will automatically guide the main agent through initialization and the optimization loop.

### UI Transparency

The extension is designed for maximum transparency:

- **Per-subagent prompt** — Expanded tool results show the exact task prompt given to the subagent.
- **Live streaming** — Subagent outputs stream in real-time while they work.
- **Call stack widget** — A persistent widget above the editor shows active subagents and call history.
- **Final summary** — Call `hpc_show_summary` (or type `/hpc-summary`) to see aggregate token usage, cost, and success/failure of every subagent call.

### Subagent Models

You can edit `agents/*.md` to set a `model:` in the frontmatter. Example:

```yaml
---
name: profiler
model: gpt-4o-mini
---
```

Leaving `model` blank uses pi's current default model.
