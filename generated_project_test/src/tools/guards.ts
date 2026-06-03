import { Type } from "@earendil-works/pi-ai";
import { type AgentTool } from "@earendil-works/pi-agent-core";

export const verificationGuardTool: AgentTool<typeof Type.Object> = {
    name: "verify_no_lut_or_hardcode",
    label: "Structural & Cheat Guard",
    description: "Verify optimization doesn't use lookup tables, hardcoded results, or GPU code",
    parameters: Type.Object({ code: Type.String() }),
    execute: async (_id, params) => {
        const violations = [];
        const code = params.code.toLowerCase();

        // Simple regex checks (in reality, AST parsing is better but this serves as a basic guard)
        if (code.includes("nvcc") || code.includes("__global__") || code.includes("hipcc")) {
            violations.push("GPU specific code detected (Rule 1 violation: Use only CPU)");
        }

        if (code.match(/static\s+const\s+(int|float|double|char)\s+\w+\[\s*[0-9]{3,}\s*\]\s*=/)) {
            violations.push("Potential Lookup Table (LUT) detected! (Rule 4 violation)");
        }

        if (code.match(/asm\s+\(/)) {
            violations.push("Inline assembly detected. Might break portability. Please review.");
        }

        return {
            content: [{ type: "text", text: violations.length ? "REJECTED:\n" + violations.join("\n") : "PASS" }],
            details: { violations }
        };
    }
};
