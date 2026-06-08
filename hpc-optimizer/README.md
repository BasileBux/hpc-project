# HPC project

The goal is to build a full pipeline of agents that can work together to optimize
a project. The optimization asked can be really targeted and local or more global
on a whole project.

The biggest bottlenecks in LLMs is memory. Memory is expensive and the LLM remembers
the last n tokens better and tends to forget content which is too old. This is why
we have a lot of sub agent which all have really targeted and specific tasks aiming
to reduce their context windows and token usage.

## Main idea

![./diagrams/concept.png](./diagrams/concept.png)

The main agent serves primarily to write prompts for subagents and link them together.
It's role is to orchestrate the subagents and ensure that the pipeline stays coherent.
It needs to have a mid/low level of intelligence. It only needs to write good prompts
and link the agents together.

It needs to do one optimization at a time. It has a list of all optimization types
and goes through them one by one. It only goes to the next one if the previous performance
assessment is good enough. When this is the case, it commits the code on the current
branch with a message describing: the iteration and optimization type, the performance
before and after, and the files changed.

The optimization loop goes for N iterations. Each iteration does one optimization.
This way, it's easier to track how many optimizations we are doing.

## Subagents

### Project discovery

Intelligence level: low

Is called once before the start of the loop to discover the project and its structure.
It will focus on the areas of the project which are relevant to the task. It will
read the project structure and some files to get a good understanding of the project.

Then, it will write a report on the project structure and the global data flow and
logic of the different components. This report will be injected in the context of
all the other agents so that they have a good understanding of the project and don't
need to polute their context too much with project discovery.

### Unit test writer

Intelligence level: mid

Is called once before the start of the loop to write unit tests for the parts of
the project which are relevant to the task. The goal is to ensure that the optimizations
don't change the behavior of the code and that we can easily check if the optimizations
are correct or not. It will read the project structure and some files to understand
the code and write unit tests for the relevant parts. It should focus on writing good
unit tests which cover the relevant parts of the code.

### Optimization finder

Intelligence level: high

It is given an optimization type and is able to run benchmarks and read their results
to identify potential optimizations. It should read files but never write code.
At the end, it writes a report describing in detail the potential optimizations it
found in the given optimization type. This report will be the prompt used by the code
writer agent to write code.

### Code writer

Intelligence level: high

It is given a report on what to optimize and how to optimize it. It should read files
to understand the context and write the implementation. It should focus on keeping
the code size small and keep the code quality good. It uses build
tools to get a fast feedback loop while writing the code. It should also run the
unit tests as part of the feedback loop to ensure that the optimizations don't break
the code.

### Performace assessor

Intelligence level: mid

It is called once before the loop to run benchmarks and get the performance of the
project before any optimization. Then, it is called after each optimization. Once
the code writer has implemented the optimization, the performance assessor runs
benchmarks again to asess the performance improvement. It should compare the results
with the previous performance and write a report describing the performance improvement.
Actually, it should write two reports: one for the next iteration, and one in json
format which is written to a file so that we can render it in a nice web dashboard.

## Details

### User inputs

- C code base (more than only 1 file but entire codebase)
- Only 1 input to optimise (1 fixed command line) (input_to_optimise)
- Some/All inputs where the code need to work fine. (inputs_working)
- MaxTime, MaxTokenUse, MaxMoneyUse, MaxNumberOfLoop
- Metric to optimise (per default use min time)

Goal: Minimise time used by an algorithm for a fixed input.

### Initialisation Phase

The goal of this phase is to do multiple things:

1. Project discovery.
2. Create unit test, i.e. assume the code is working perfectly as it is. Create files with all inputs tested and attended result (inputs_working + input_to_optimise). Watch out for the use of random variable. If so, change to setseed for reproduction purpose.
3. Test it's performance on the input to optimise to get the baseline. Only do precise input speed test multiple time (we can look at baseline and do like min_number_of_iteration or else, max_time/one_shot_speed number of time) and track min, mean, median and max time.

Keep track, for which input (we can do one_shot for working inputs but total analysis for input to optimise), which alogrithm is faster of the metric used and we can create a small c script that does if inputs is between that => use this code

BUT on the loop phase, we will only keep track of the better code for the specific input to optimise.

### Loop phase

The goal of this phase is to describe exactly how the optimisation loop is working.

1. Time bottleneck test (find which part of the code is the bottleneck using flamegraphs (not visually but numericly))
2. Find why the bottleneck exist between finite set of predefined limits:
- Cache
- Single thread instruction density
- Parallelisation
- Theoretical/Model, other algorithm
- Other data-structure

Using predefined tools like cachegrind, etc...

3. Once thats done, call specific agent optimiser (with specific prompt like focusing on cache optimisation) using all function call stack to optimise, which bottleneck exists (the result of previous analysis)

4. Verify if it compiles, if not, the code writer should fix the code until it compiles.

We keep track of the best code.

6. We loop on this specific problem with all code tested until we get sufficient  performance boost (simple: if better, break)

### Global Rules to follow

1. Use only CPU.
2. Use C code only.
3. No machine specific optimisation.
4. No assumption on hardcoding/lut and so on! Do no just output the result.
5. Max loop, token, price size for all loop.

### Compiler & Build
- **GCC / Clang** — compilation with `-g -O2 -fno-omit-frame-pointer` for profiling; `-O3 -march=native` for final benchmarks; PGO and LTO support
- **Compiler diagnostics extractor** — parses warnings, errors, and vectorization remarks into structured JSON

### Time Benchmarking
- **Hyperfine** — cross-platform benchmarking with statistical analysis and JSON export

### Bottleneck Analysis (Flamegraphs)
- **perf + FlameGraph** — `perf record -F 997 -g` for CPU sampling, `stackcollapse-perf.pl` + `flamegraph.pl` for visualization, `perf report --stdio` for numeric summaries parseable by LLMs
- **perf stat** — quick hardware counter snapshot (cycles, instructions, branches, branch-misses, cache-references, cache-misses) for bottleneck classification

### Cache Analysis
- **Valgrind Cachegrind** — simulates L1/L2/LL cache hierarchy, reports `D1mr`/`D2mr`/`D1mw`/`D2mw` per function and source line
- **perf cache events** — real hardware counters: `L1-dcache-loads/misses`, `L1-icache-loads/misses`, `LLC-loads/misses`, `dTLB-loads/misses`

### Branch Prediction
- **perf branch events** — `branches`, `branch-misses`, `branch-loads`, `branch-load-misses`
- **perf branch stacks** — `perf record -e branch-misses -b` to capture misprediction locations

### Memory / Heap
- **Valgrind Massif** — heap profiler tracking memory usage over time with peak detection
- **perf mem record/report** — memory access pattern and latency analysis

### Parallelization
- **perf sched** — thread scheduling analysis, latency reports
- **Intel VTune / AMD uProf** — advanced parallel performance analysis (if available on target hardware)

### Static Analysis
- **clang-tidy** — performance and portability anti-pattern detection
- **cppcheck** — fast C static analysis

### Binary Analysis
- **objdump** — disassembly inspection (`-d -M intel -S`)
- **nm** — symbol table with sizes (`--print-size --size-sort`)

### Correctness & Testing
- **diff** — output comparison for regression testing
- **Valgrind Memcheck** — memory error detection to catch optimization-introduced bugs

### Reporting & Aggregation
- **Benchmark result parser** — Python script comparing baseline vs. current iteration, calculating improvement %, generating dashboard JSON and commit messages

---

## Pi Package Usage

This repository is also a **pi package** that implements the full HPC optimizer workflow.

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
| `agents/*.md` | Subagent definitions (project-discovery, unit-test-writer, optimization-finder, code-writer, performance-assessor) |

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

You can edit `agents/*.md` to set a `model:` in the frontmatter for cheaper subagents. Example:

```yaml
---
name: project-discovery
model: gpt-4o-mini
---
```

Leaving `model` blank uses pi's current default model.
