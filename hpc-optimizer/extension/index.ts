import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { type ExtensionAPI, getMarkdownTheme, parseFrontmatter, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ───────────────────────────────────────────────
   Agent Discovery
   ─────────────────────────────────────────────── */

interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: string;
	filePath: string;
}

function loadAgentsFromDir(dir: string, source: string): AgentConfig[] {
	const agents: AgentConfig[] = [];
	if (!fs.existsSync(dir)) return agents;

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
		if (!frontmatter.name || !frontmatter.description) continue;

		const tools = frontmatter.tools
			?.split(",")
			.map((t: string) => t.trim())
			.filter(Boolean);

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: tools && tools.length > 0 ? tools : undefined,
			model: frontmatter.model,
			systemPrompt: body,
			source,
			filePath,
		});
	}

	return agents;
}

function discoverAgents(cwd: string): AgentConfig[] {
	const pkgDir = path.resolve(__dirname, "..", "agents");
	const projectDir = path.join(cwd, ".pi", "agents");
	const userDir = path.join(os.homedir(), ".pi", "agent", "agents");

	const pkgAgents = loadAgentsFromDir(pkgDir, "package");
	const userAgents = loadAgentsFromDir(userDir, "user");
	const projectAgents = loadAgentsFromDir(projectDir, "project");

	const map = new Map<string, AgentConfig>();
	for (const a of pkgAgents) map.set(a.name, a);
	for (const a of userAgents) map.set(a.name, a);
	for (const a of projectAgents) map.set(a.name, a);

	return Array.from(map.values());
}

/* ───────────────────────────────────────────────
   Subagent Execution
   ─────────────────────────────────────────────── */

interface HpcSubagentResult {
	agent: string;
	task: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	finalOutput: string;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
		turns: number;
	};
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}
	return { command: "pi", args };
}

async function writePromptToTempFile(agentName: string, prompt: string): Promise<string> {
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "hpc-subagent-"));
	const safeName = agentName.replace(/[^\w.-]+/g, "_");
	const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
	await withFileMutationQueue(filePath, async () => {
		await fs.promises.writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
	});
	return filePath;
}

/* ───────────────────────────────────────────────
   Call Stack Tracking
   ─────────────────────────────────────────────── */

interface HistoryEntry {
	agent: string;
	task: string;
	startTime: number;
	endTime: number;
	status: "success" | "error" | "aborted";
	usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; turns: number };
}

const activeCalls = new Map<string, { agent: string; task: string; startTime: number }>();
const callHistory: HistoryEntry[] = [];

function aggregateUsage() {
	const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
	for (const h of callHistory) {
		total.input += h.usage.input;
		total.output += h.usage.output;
		total.cacheRead += h.usage.cacheRead;
		total.cacheWrite += h.usage.cacheWrite;
		total.cost += h.usage.cost;
		total.turns += h.usage.turns;
	}
	return total;
}

function updateWidget(ctx: any) {
	const lines: string[] = [];
	lines.push("╔═══ HPC Optimizer Call Stack ═══╗");

	if (activeCalls.size > 0) {
		lines.push("║ ▶ ACTIVE:");
		for (const [, info] of activeCalls) {
			const preview = info.task.length > 48 ? info.task.slice(0, 48) + "…" : info.task;
			lines.push(`║   • ${info.agent}: ${preview}`);
		}
	} else {
		lines.push("║ (no active subagents)");
	}

	if (callHistory.length > 0) {
		lines.push("║ ▶ HISTORY:");
		for (const h of callHistory.slice(-6)) {
			const icon = h.status === "success" ? "✓" : h.status === "error" ? "✗" : "⊘";
			const duration = ((h.endTime - h.startTime) / 1000).toFixed(1);
			lines.push(`║   ${icon} ${h.agent} (${duration}s)`);
		}
	}

	const u = aggregateUsage();
	lines.push("║ ───────────────────────────────");
	lines.push(`║  Total: ↑${u.input} ↓${u.output}  $${u.cost.toFixed(4)}  ${u.turns} turns`);
	lines.push("╚════════════════════════════════╝");
	ctx.ui.setWidget("hpc-optimizer", lines);
}

/* ───────────────────────────────────────────────
   Run Single Agent
   ─────────────────────────────────────────────── */

async function runSingleAgent(
	cwd: string,
	agents: AgentConfig[],
	agentName: string,
	task: string,
	signal: AbortSignal | undefined,
	onUpdate: ((result: HpcSubagentResult) => void) | undefined,
	ctx: any,
	callId: string,
): Promise<HpcSubagentResult> {
	const agent = agents.find((a) => a.name === agentName);

	const result: HpcSubagentResult = {
		agent: agentName,
		task,
		exitCode: 0,
		messages: [],
		stderr: "",
		finalOutput: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
	};

	if (!agent) {
		result.exitCode = 1;
		result.stderr = `Unknown agent: "${agentName}". Available: ${agents.map((a) => a.name).join(", ") || "none"}.`;
		return result;
	}

	result.model = agent.model;

	const args: string[] = ["--mode", "json", "-p", "--no-session"];
	if (agent.model) args.push("--model", agent.model);
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

	let tmpPromptPath: string | null = null;

	try {
		if (agent.systemPrompt.trim()) {
			tmpPromptPath = await writePromptToTempFile(agent.name, agent.systemPrompt);
			args.push("--append-system-prompt", tmpPromptPath);
		}

		args.push(`Task: ${task}`);

		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getPiInvocation(args);
			const proc = spawn(invocation.command, invocation.args, {
				cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: any;
				try {
					event = JSON.parse(line);
				} catch {
					return;
				}

				if (event.type === "message_end" && event.message) {
					const msg = event.message as Message;
					result.messages.push(msg);

					if (msg.role === "assistant") {
						result.usage.turns++;
						const usage = msg.usage;
						if (usage) {
							result.usage.input += usage.input || 0;
							result.usage.output += usage.output || 0;
							result.usage.cacheRead += usage.cacheRead || 0;
							result.usage.cacheWrite += usage.cacheWrite || 0;
							result.usage.cost += usage.cost?.total || 0;
						}
						if (!result.model && msg.model) result.model = msg.model;
						if (msg.stopReason) result.stopReason = msg.stopReason;
						if (msg.errorMessage) result.errorMessage = msg.errorMessage;

						// Extract final text output
						for (let i = result.messages.length - 1; i >= 0; i--) {
							const m = result.messages[i];
							if (m.role === "assistant") {
								for (const part of m.content) {
									if (part.type === "text") {
										result.finalOutput = part.text;
										break;
									}
								}
								if (result.finalOutput) break;
							}
						}
					}
					if (onUpdate) onUpdate(result);
				}

				if (event.type === "tool_result_end" && event.message) {
					result.messages.push(event.message as Message);
					if (onUpdate) onUpdate(result);
				}
			};

			proc.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});

			proc.stderr.on("data", (data) => {
				result.stderr += data.toString();
			});

			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});

			proc.on("error", () => {
				resolve(1);
			});

			if (signal) {
				const killProc = () => {
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				};
				if (signal.aborted) killProc();
				else signal.addEventListener("abort", killProc, { once: true });
			}
		});

		result.exitCode = exitCode;
	} finally {
		if (tmpPromptPath) {
			try {
				const dir = path.dirname(tmpPromptPath);
				fs.unlinkSync(tmpPromptPath);
				fs.rmdirSync(dir);
			} catch {
				/* ignore */
			}
		}
	}

	return result;
}

/* ───────────────────────────────────────────────
   Extension Export
   ─────────────────────────────────────────────── */

const HpcSubagentParams = Type.Object({
	agent: Type.Optional(Type.String({ description: "Agent name (for single mode)" })),
	task: Type.Optional(Type.String({ description: "Task description (for single mode)" })),
	chain: Type.Optional(
		Type.Array(
			Type.Object({
				agent: Type.String(),
				task: Type.String(),
			}),
			{ description: "Sequential chain of subagents. Use {previous} to insert prior output." },
		),
	),
});

export default function (pi: ExtensionAPI) {
	/* Widget init on session start */
	pi.on("session_start", async (_event, ctx) => {
		updateWidget(ctx);
	});

	/* Main subagent tool */
	pi.registerTool({
		name: "hpc_subagent",
		label: "HPC Subagent",
		description:
			"Delegate tasks to specialized HPC optimization subagents with isolated context windows. Transparent: shows full prompt and streaming response.",
		parameters: HpcSubagentParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const cwd = ctx.cwd;
			const agents = discoverAgents(cwd);

			/* ── Chain mode ── */
			if (params.chain && params.chain.length > 0) {
				const results: HpcSubagentResult[] = [];
				let previousOutput = "";

				for (let i = 0; i < params.chain.length; i++) {
					const step = params.chain[i];
					const task = step.task.replace(/\{previous\}/g, previousOutput);
					const callId = `chain-${i}-${Date.now()}`;

					activeCalls.set(callId, { agent: step.agent, task, startTime: Date.now() });
					updateWidget(ctx);

					const result = await runSingleAgent(
						cwd,
						agents,
						step.agent,
						task,
						signal,
						(r) => {
							if (onUpdate) {
								onUpdate({
									content: [{ type: "text", text: r.finalOutput || "(working…)" }],
									details: { mode: "chain", results: [...results, r] },
								});
							}
						},
						ctx,
						callId,
					);

					activeCalls.delete(callId);
					callHistory.push({
						agent: step.agent,
						task,
						startTime: Date.now() - 1000,
						endTime: Date.now(),
						status: result.exitCode === 0 && !result.errorMessage ? "success" : "error",
						usage: { ...result.usage },
					});
					updateWidget(ctx);

					results.push(result);

					if (result.exitCode !== 0 || result.errorMessage) {
						return {
							content: [
								{
									type: "text",
									text: `Chain failed at step ${i + 1} (${step.agent}):\n${result.stderr || result.errorMessage || result.finalOutput || "(no output)"}`,
								},
							],
							details: { mode: "chain", results },
							isError: true,
						};
					}
					previousOutput = result.finalOutput;
				}

				return {
					content: [
						{
							type: "text",
							text: results[results.length - 1]?.finalOutput || "(no output)",
						},
					],
					details: { mode: "chain", results },
				};
			}

			/* ── Single mode ── */
			if (!params.agent || !params.task) {
				const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
				return {
					content: [{ type: "text", text: `Invalid parameters. Available agents: ${available}` }],
					details: { mode: "single", results: [] },
				};
			}

			const callId = `single-${Date.now()}`;
			activeCalls.set(callId, { agent: params.agent, task: params.task, startTime: Date.now() });
			updateWidget(ctx);

			const result = await runSingleAgent(
				cwd,
				agents,
				params.agent,
				params.task,
				signal,
				(r) => {
					if (onUpdate) {
						onUpdate({
							content: [{ type: "text", text: r.finalOutput || "(working…)" }],
							details: { mode: "single", results: [r] },
						});
					}
				},
				ctx,
				callId,
			);

			activeCalls.delete(callId);
			callHistory.push({
				agent: params.agent,
				task: params.task,
				startTime: Date.now() - 1000,
				endTime: Date.now(),
				status: result.exitCode === 0 && !result.errorMessage ? "success" : "error",
				usage: { ...result.usage },
			});
			updateWidget(ctx);

			const isError = result.exitCode !== 0 || result.errorMessage;
			return {
				content: [{ type: "text", text: result.finalOutput || result.stderr || "(no output)" }],
				details: { mode: "single", results: [result] },
				isError,
			};
		},

		/* ── Rendering ── */
		renderCall(args, theme) {
			if (args.chain && args.chain.length > 0) {
				let text =
					theme.fg("toolTitle", theme.bold("hpc_subagent ")) +
					theme.fg("accent", `chain (${args.chain.length} steps)`);
				for (let i = 0; i < Math.min(args.chain.length, 3); i++) {
					const step = args.chain[i];
					const preview = step.task.length > 40 ? step.task.slice(0, 40) + "…" : step.task;
					text +=
						`\n  ${theme.fg("muted", `${i + 1}.`)} ${theme.fg("accent", step.agent)}${theme.fg("dim", ` ${preview}`)}`;
				}
				if (args.chain.length > 3)
					text += `\n  ${theme.fg("muted", `… +${args.chain.length - 3} more`)}`;
				return new Text(text, 0, 0);
			}

			const agentName = args.agent || "…";
			const preview = args.task ? (args.task.length > 60 ? args.task.slice(0, 60) + "…" : args.task) : "…";
			let text =
				theme.fg("toolTitle", theme.bold("hpc_subagent ")) + theme.fg("accent", agentName);
			text += `\n  ${theme.fg("dim", preview)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as { mode: string; results: HpcSubagentResult[] } | undefined;
			if (!details || !details.results.length) {
				const t = result.content[0];
				return new Text(t?.type === "text" ? t.text : "(no output)", 0, 0);
			}

			const mdTheme = getMarkdownTheme();

			/* Single result */
			if (details.mode === "single" && details.results.length === 1) {
				const r = details.results[0];
				const ok = r.exitCode === 0 && !r.errorMessage;

				if (expanded) {
					const container = new Container();
					const icon = ok ? theme.fg("success", "✓") : theme.fg("error", "✗");
					container.addChild(
						new Text(
							`${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", r.model ? ` [${r.model}]` : "")}`,
							0,
							0,
						),
					);
					if (!ok && r.errorMessage)
						container.addChild(new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0));

					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("muted", "─── Prompt ───"), 0, 0));
					const promptPreview =
						r.task.length > 800 ? r.task.slice(0, 800) + "\n…(truncated)" : r.task;
					container.addChild(new Text(theme.fg("dim", promptPreview), 0, 0));

					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
					if (r.finalOutput) {
						container.addChild(new Markdown(r.finalOutput.trim(), 0, 0, mdTheme));
					} else {
						container.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));
					}

					if (r.stderr) {
						container.addChild(new Spacer(1));
						container.addChild(
							new Text(theme.fg("warning", `stderr:\n${r.stderr.slice(0, 500)}`), 0, 0),
						);
					}

					const usage = `Turns: ${r.usage.turns}  ↑${r.usage.input} ↓${r.usage.output}  R${r.usage.cacheRead} W${r.usage.cacheWrite}  $${r.usage.cost.toFixed(4)}`;
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("dim", usage), 0, 0));

					return container;
				}

				// Collapsed
				const icon = ok ? theme.fg("success", "✓") : theme.fg("error", "✗");
				let text = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}`;
				if (!ok && r.stopReason) text += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
				text += `\n${theme.fg("dim", r.task)}`;
				if (r.finalOutput) {
					const lines = r.finalOutput.split("\n").slice(0, 4).join("\n");
					text += `\n${theme.fg("toolOutput", lines)}`;
					if (r.finalOutput.split("\n").length > 4)
						text += theme.fg("muted", "\n…(Ctrl+O to expand)");
				} else {
					text += `\n${theme.fg("muted", "(no output)")}`;
				}
				const usage = `Turns: ${r.usage.turns}  ↑${r.usage.input} ↓${r.usage.output}  $${r.usage.cost.toFixed(4)}`;
				text += `\n${theme.fg("dim", usage)}`;
				return new Text(text, 0, 0);
			}

			/* Chain result */
			if (details.mode === "chain") {
				const allOk = details.results.every((r) => r.exitCode === 0 && !r.errorMessage);
				const icon = allOk ? theme.fg("success", "✓") : theme.fg("error", "✗");

				if (expanded) {
					const container = new Container();
					container.addChild(
						new Text(
							`${icon} ${theme.fg("toolTitle", theme.bold("chain"))} (${details.results.length} steps)`,
							0,
							0,
						),
					);

					for (let i = 0; i < details.results.length; i++) {
						const r = details.results[i];
						const stepOk = r.exitCode === 0 && !r.errorMessage;
						const stepIcon = stepOk ? theme.fg("success", "✓") : theme.fg("error", "✗");
						container.addChild(new Spacer(1));
						container.addChild(
							new Text(
								`${theme.fg("muted", `Step ${i + 1}:`)} ${theme.fg("accent", r.agent)} ${stepIcon}`,
								0,
								0,
							),
						);
						container.addChild(new Text(theme.fg("dim", `Task: ${r.task}`), 0, 0));
						if (r.finalOutput) {
							container.addChild(new Markdown(r.finalOutput.trim(), 0, 0, mdTheme));
						}
						const usage = `Turns: ${r.usage.turns}  ↑${r.usage.input} ↓${r.usage.output}  $${r.usage.cost.toFixed(4)}`;
						container.addChild(new Text(theme.fg("dim", usage), 0, 0));
					}
					return container;
				}

				// Collapsed
				let text = `${icon} ${theme.fg("toolTitle", theme.bold("chain"))} (${details.results.length} steps)`;
				for (let i = 0; i < details.results.length; i++) {
					const r = details.results[i];
					const stepOk = r.exitCode === 0 && !r.errorMessage;
					const stepIcon = stepOk ? theme.fg("success", "✓") : theme.fg("error", "✗");
					text += `\n${theme.fg("muted", `Step ${i + 1}:`)} ${theme.fg("accent", r.agent)} ${stepIcon}`;
					if (r.finalOutput) {
						const lines = r.finalOutput.split("\n").slice(0, 2).join("\n");
						text += `\n${theme.fg("toolOutput", lines)}`;
					}
				}
				text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				return new Text(text, 0, 0);
			}

			const t = result.content[0];
			return new Text(t?.type === "text" ? t.text : "(no output)", 0, 0);
		},
	});

	/* Summary tool that the coordinator can call at the end */
	pi.registerTool({
		name: "hpc_show_summary",
		label: "Show HPC Summary",
		description: "Display a summary of all subagent calls and aggregate usage in the UI. Call this at the end of the optimization workflow.",
		parameters: Type.Object({}),
		async execute() {
			if (callHistory.length === 0) {
				return {
					content: [{ type: "text", text: "No subagent calls have been made yet." }],
				};
			}

			const u = aggregateUsage();
			const lines: string[] = [];
			lines.push("# HPC Optimizer Summary");
			lines.push("");
			lines.push(`**Total subagent calls:** ${callHistory.length}`);
			lines.push(`**Total turns:** ${u.turns}`);
			lines.push(`**Total tokens:** ↑${u.input} ↓${u.output} (cache R${u.cacheRead} W${u.cacheWrite})`);
			lines.push(`**Estimated cost:** $${u.cost.toFixed(4)}`);
			lines.push("");
			lines.push("## Call History");
			lines.push("");
			lines.push("| # | Agent | Status | Turns | Cost |");
			lines.push("|---|-------|--------|-------|------|");
			for (let i = 0; i < callHistory.length; i++) {
				const h = callHistory[i];
				const status = h.status === "success" ? "✓" : "✗";
				lines.push(`| ${i + 1} | ${h.agent} | ${status} | ${h.usage.turns} | $${h.usage.cost.toFixed(4)} |`);
			}

			const summary = lines.join("\n");
			return {
				content: [{ type: "text", text: summary }],
				details: { history: callHistory, aggregate: u },
			};
		},

		renderResult(result, _options, theme) {
			const text = result.content[0]?.type === "text" ? result.content[0].text : "(no summary)";
			return new Markdown(text.trim(), 0, 0, getMarkdownTheme());
		},
	});

	/* Summary command */
	pi.registerCommand("hpc-summary", {
		description: "Show HPC optimizer subagent call summary",
		handler: async (_args, ctx) => {
			if (callHistory.length === 0) {
				ctx.ui.notify("No subagent calls yet.", "info");
				return;
			}

			const u = aggregateUsage();
			const lines: string[] = [];
			lines.push("═══ HPC Optimizer Summary ═══");
			for (const h of callHistory) {
				const icon = h.status === "success" ? "✓" : "✗";
				const preview = h.task.length > 55 ? h.task.slice(0, 55) + "…" : h.task;
				lines.push(`${icon} ${h.agent}: ${preview}`);
			}
			lines.push("──────────────────────────────");
			lines.push(`Total: ↑${u.input} ↓${u.output}  $${u.cost.toFixed(4)}  ${u.turns} turns`);
			lines.push("══════════════════════════════");

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
