import { SessionManager, createAgentSession } from "@earendil-works/pi-coding-agent";
import { getModel } from "@earendil-works/pi-ai";
import { initPhaseTool } from "./tools/init-phase.js";
import { loopPhaseTool } from "./tools/loop-phase.js";
import { verificationGuardTool } from "./tools/guards.js";

async function main() {
    console.log("Booting HPC Orchestrator Pipeline...");

    const model = getModel("anthropic", "claude-3-5-sonnet-20241022"); // You can switch this to DeepSeek or Kimi

    const { session } = await createAgentSession({
        model,
        thinkingLevel: "off",
        sessionManager: SessionManager.create(process.cwd()),
        customTools: [
            initPhaseTool,
            loopPhaseTool,
            verificationGuardTool
        ]
    });

    console.log("Main orchestrator session started successfully!");

    // Command to launch the initialization prompt automatically
    // await session.prompt("Commence the HPC Initialization phase for the inputs in the codebase...");
}

main().catch(console.error);
