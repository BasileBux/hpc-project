import { Type } from "@earendil-works/pi-ai";
import { type AgentTool } from "@earendil-works/pi-agent-core";
import { runSubagent } from "../subagent.js";
import { execSync } from "child_process";
import { promisify } from "util";

const exec = promisify(execSync);

const initPhaseParams = Type.Object({
    inputToOptimise: Type.String({ description: "Fixed CLI command to optimize" }),
    inputsWorking: Type.Array(Type.String(), { description: "Working inputs for testing" }),
    maxTime: Type.Number(),
    metric: Type.Enum(["min", "mean", "median", "max"])
});

export const initPhaseTool: AgentTool<typeof initPhaseParams> = {
    name: "run_initialization",
    label: "Initialization Phase",
    description: "Project discovery, test generation, and establishing the baseline performance",
    parameters: initPhaseParams,
    execute: async (_id, params) => {
        // 1. Project discovery
        const discovery = await runSubagent({
            agentName: "project-discovery",
            prompt: "Analyze the codebase structure and global data flow. Return a detailed markdown report."
        });

        // 2. Unit test writer
        const tests = await runSubagent({
            agentName: "unit-test-writer",
            prompt: `Assume the code is working perfectly. Create unit test setups for the following baseline inputs: ${params.inputsWorking.join(', ')} and ${params.inputToOptimise}. Ensure you set a fixed random seed if randomness is used.`
        });

        // 3. Baseline benchmark
        console.log("Running baseline benchmark via hyperfine...");
        const baselineResultsStr = exec(`hyperfine --export-json baseline.json '${params.inputToOptimise}'`).toString();

        return {
            content: [
                { type: "text", text: `Initialized successfully. Discovery Report: \n${discovery}\n\nUnit tests prepared.` }
            ],
            details: { discovery, tests, metric: params.metric }
        };
    }
};
