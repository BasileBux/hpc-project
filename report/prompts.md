# Kimi-k2.6 prompt in pi agent harness to build the workflow:
```markdown
For a school exploratory project, I have to create a full AI workflow in the pi agent harness (we are currently in) to optimize C code.
I wrote README.md which describes in great detail the workflow and the steps to build it. I need you to implement it in the pi agent harness.
You will write the package in `.`. The ultimate goal is to use sub agents extensively to test if we can use "dumber" agents
to compete with "smarter" agents by using less context and focusing their attention on specific tasks. With this we expect to cut costs
but keep reasonable performance. To get the full context and details, please read the `./README.md` file. For the UI (visuals only so not logic),
I want it to be as transparent as possible. For each subagent, I want to have the prompt it was given at the top and the full response it is giving
while the agent is working so that it is super easy to understand what is going on. If we are in the coordinator agent, show the full subagent
call stack. At the end, I want to have a summary of the results for each optimization step and a small summary of what was done.
```

# Prompt for the workflow for the nbody optimization:
```markdown
Optimize this code using the following parameters:

Target to optimize:	    ./nbody 4096 100	Large input to optimize (4096 bodies, 100 steps)
Working target:	        ./nbody 256 10	Small correctness test
Working target:	        ./nbody 512 10	Medium correctness test

max_iterations              5
max_time_minutes	        30
max_tokens	                500,000
max_cost	                $5.00
build_command	            make
metric	                    min_time
compiler_flags_profile      -g -O2 -fno-omit-frame-pointer
compiler_flags_benchmark    -O3 -march=native
```

# Prompt to optimize without the optimization workflow for the nbody optimization:
```markdown
## Optimize this C N-body simulation for minimum runtime.
You have `read`, `write`, `edit`, and `bash` tools. Work in the current directory..

## Parameters & constraints:

- Target input: ./nbody 4096 100
- Working inputs (correctness): ./nbody 256 10 and ./nbody 512 10
- Max iterations: 5
- Max wall time: 30 minutes
- Max tokens: 500,000
- Max cost: $5.00
- Build command: make
- Optimization metric: min_time (measured by hyperfine or time)
- Profile flags: -g -O2 -fno-omit-frame-pointer
- Benchmark flags: -O3 -march=native

## Global rules:
- Use only CPU. Standard C only. No machine-specific intrinsics, no OpenMP, no hardcoded results or lookup tables.
- Preserve correctness at all costs. Working inputs must produce identical output to before.

## Workflow — run this loop up to 5 times or until budget/time runs out:
1. Baseline / current measurement:
    - If this is iteration 1, record the current checksums of the working inputs and measure the target runtime with hyperfine --warmup 1 './nbody 4096 100' (or time if hyperfine is unavailable). Save this as your baseline.
2. Profile:
    - Compile with profile flags: make clean && CFLAGS="-g -O2 -fno-omit-frame-pointer" make
    - Run perf stat -e cycles,instructions,cache-references,cache-misses,branches,branch-misses -- ./nbody 4096 100
    - Run valgrind --tool=cachegrind -- ./nbody 4096 100 (if available)
    - Run perf record -F 997 -g -- ./nbody 4096 100 and inspect perf report --stdio
    - Run clang-tidy or cppcheck if available for static analysis hints.
3. Analyze & optimize:
    - Based on the profiling data, identify the bottleneck (cache, instruction density, algorithm, data structure, etc.).
    - Implement one focused optimization in the source code. Keep changes minimal.
    - Re-compile with benchmark flags: make clean && CFLAGS="-O3 -march=native" make
4. Verify correctness:
    - Run ./nbody 256 10 > out_256.txt and ./nbody 512 10 > out_512.txt.
    - Compare against the original checksums. If they differ, revert or fix immediately. Do not proceed until correctness is restored.
5. Measure:
    - Run hyperfine --warmup 1 './nbody 4096 100' (or equivalent).
    - Compare min time to your best-so-far. If improved, keep the code. If not improved or slower, revert.
6. Track state:
    - Maintain a running summary of each iteration: what you changed, why, the profiling evidence, and the resulting min time.
    - Stop if you exceed 5 iterations, 30 minutes, 500k tokens, or $5.00.
Final deliverable:
    - Return the best min time achieved, the speedup over baseline, a summary of what worked, and what didn't.
```

# Prompt for the workflow for matrix multiplication optimization:
```markdown
Optimize this code using the following parameters:
Target to optimize:	    ./matmul 1024          Large input to optimize (1024×1024 matrices)
Working target:	        ./matmul 256            Small correctness test
Working target:	        ./matmul 512            Medium correctness test
max_iterations              5
max_time_minutes	        30
max_tokens	                500,000
max_cost	                $5.00
build_command	            make
metric	                    min_time
compiler_flags_profile      -g -O2 -fno-omit-frame-pointer
compiler_flags_benchmark    -O3 -march=native 
Additional context for the coordinator:
- The codebase is in the current directory .
- The program prints checksum: <value> to stdout and time_ms: <milliseconds> to stderr
- Correctness is verified by checking that ./matmul 256 and ./matmul 512 produce identical checksums to their baseline values
- The optimization loop should use the profiler agent to run perf stat, cachegrind, and hyperfine, then the optimizer agent to read profiling data, edit code, compile, verify correctness, and benchmark — all in one invocation
- After each successful improvement, git add -A && git commit -m "Iter N: <description>. Before Xms, After Yms"
- If an iteration does not improve performance, revert changes and continue
```

# Prompt to optimize without the optimization workflow for matrix multiplication optimization:
```markdown
Optimize this C matrix multiplication code for minimum runtime.
You have read, write, edit, and bash tools. Work in the current directory `.`.
Target to optimize:	    ./matmul 1024           (1024×1024 matrices)
Working targets:        ./matmul 256            (small correctness test)
                        ./matmul 512            (medium correctness test)
Constraints:
max_iterations              5
max_time_minutes	        30
max_tokens	                500,000
max_cost	                $5.00
build_command	            make
metric	                    min_time
compiler_flags_profile      -g -O2 -fno-omit-frame-pointer
compiler_flags_benchmark    -O3 -march=native
Global rules:
- Use only CPU. Standard C only. No machine-specific intrinsics, no OpenMP, no hardcoded results or lookup tables.
- Preserve correctness at all costs. Working inputs must produce identical checksum output to before.
Workflow — run this loop up to 5 times or until budget/time runs out:
1. If iteration 1, record baseline checksums of working inputs and measure target with hyperfine --warmup 1 './matmul 1024' (or time if hyperfine unavailable).
2. Profile: compile with profile flags, then run perf stat, cachegrind, perf record + report, and any static analysis.
3. Analyze & optimize: based on profiling, implement ONE focused optimization. Re-compile with benchmark flags.
4. Verify correctness: run ./matmul 256 and ./matmul 512, compare checksums to baseline. If different, revert or fix immediately.
5. Measure: run hyperfine --warmup 1 './matmul 1024'. If min time improved, keep; else revert.
6. Track state: maintain a summary of each iteration (what changed, profiling evidence, resulting min time). Stop if limits exceeded.
Final deliverable: best min time, speedup over baseline, summary of what worked.
```
