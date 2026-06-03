import { Type } from "@earendil-works/pi-ai";
import { type AgentTool } from "@earendil-works/pi-agent-core";
import { runSubagent } from "../subagent.js";

const loopPhaseParams = Type.Object({
    inputToOptimise: Type.String(),
    maxLoops: Type.Number({ default: 5 }),
    optimizationTypes: Type.Array(Type.Enum(["cache", "single_thread", "multi_thread", "conceptual"]))
});

export const loopPhaseTool: AgentTool<typeof loopPhaseParams> = {
    name: "run_optimization_loop",
    label: "Main Optimizer Loop",
    description: "Iteratively profile, analyze bottlenecks, optimize, and test correctness",
    parameters: loopPhaseParams,
    execute: async (_id, params) => {
        let iteration = 0;

        while (iteration < params.maxLoops) {
            console.log(`\n--- Iteration ${iteration} ---`);

            // 1. Flamegraph numeric analysis
            const bottleneckAnalysis = await runSubagent({
                agentName: "profiler",
                prompt: `Run perf and cachegrind on '${params.inputToOptimise}', then return which bottleneck exists: cache, single-thread instructions, parallelisation, or conceptual.`
            });

            // 2. Specific Optimisation finder & Code Writer
            const newCode = await runSubagent({
                agentName: "code-writer",
                prompt: `Based on this bottleneck insight: ${bottleneckAnalysis}, generate specific C code fixing it. Do not use machine specific flags (like -march=native in build). Do not cheat with LUTs. Rely on OpenMP, SIMD Everywhere, or other portable limits if instructed.`
            });

            // 3. Compilability & Correctness check
            const correctnessCheck = await runSubagent({
                agentName: "assessor",
                prompt: `Verify the new code compiles (use GCC/Clang with standard flags). Keep context isolated. Test against the established working inputs to ensure results are identical.`
            });

            if (correctnessCheck.includes("FAIL")) {
                console.log("Correctness or compile check failed. Asking LLM to fix...");
                // Fallback logic here...
                continue;
            }

            // 4. Verification Gain
            console.log("Code passed correctness. Benchmarking gain...");
            // call hyperfine here and check if new min time < baseline

            const gainSufficient = true; // Replace with logic reading benchmark JSON
            if (gainSufficient) {
                console.log("Sufficient gain achieved! Stopping current bottleneck optimization.");
                break;
            }

            iteration++;
        }

        return { content: [{ type: "text", text: "Loop complete" }] };
    }
};
