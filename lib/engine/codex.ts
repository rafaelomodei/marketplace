import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CODEX_BIN, CODEX_HOME } from "../paths";

export type CodexRun = {
  workdir: string;
  prompt: string;
  images: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
  onLog: (line: string) => void;
  onThread?: (threadId: string) => void;
};

const truncate = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Turns one `codex exec --json` event into a readable log line (or nothing). */
export function describeEvent(ev: any): string | null {
  const item = ev.item;
  switch (ev.type) {
    case "thread.started":
      return `sessão codex ${ev.thread_id}`;
    case "turn.completed":
      return ev.usage ? `turno concluído (${ev.usage.output_tokens ?? "?"} tokens de saída)` : "turno concluído";
    case "turn.failed":
    case "error":
      return `ERRO: ${ev.error?.message ?? ev.message ?? JSON.stringify(ev)}`;
    case "item.started":
      if (item?.type === "command_execution") return `$ ${truncate(item.command ?? "")}`;
      return item?.type && item.type !== "agent_message" && item.type !== "reasoning" ? `▶ ${item.type}` : null;
    case "item.completed":
      if (item?.type === "agent_message") return `💬 ${truncate(item.text ?? "", 500)}`;
      if (item?.type === "command_execution") return item.exit_code ? `✗ comando saiu com ${item.exit_code}` : null;
      if (item?.type === "reasoning") return null;
      if (item?.type === "error") return `⚠ ${truncate(item.message ?? "", 400)}`;
      return item?.type ? `✓ ${item.type}` : null;
    default:
      return null;
  }
}

function newestImage(dir: string, since: number): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .map((f) => ({ f: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .filter((x) => x.t >= since - 1000)
    .sort((a, b) => b.t - a.t);
  return files[0]?.f ?? null;
}

/**
 * Runs `codex exec` with the images attached and returns the path of the generated image.
 * Codex is asked to copy its result to ./output.png; if it doesn't, we fall back to the
 * newest file in ~/.codex/generated_images/<thread>/.
 */
export function runCodex(run: CodexRun): Promise<{ outputPath: string; threadId: string | null }> {
  fs.mkdirSync(run.workdir, { recursive: true });
  const started = Date.now();
  const args = [
    "exec",
    "--skip-git-repo-check",
    "-s",
    "workspace-write",
    "--json",
    "-C",
    run.workdir,
    "-o",
    path.join(run.workdir, "last-message.txt"),
    // -i takes a variadic list, so it must come last; the prompt goes through stdin.
    ...(run.images.length ? ["-i", ...run.images] : []),
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(CODEX_BIN, args, { cwd: run.workdir, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    let threadId: string | null = null;
    let stdoutBuf = "";
    let settled = false;

    const kill = (reason: string) => {
      run.onLog(reason);
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    };
    const timer = setTimeout(() => kill("tempo limite excedido, encerrando codex"), run.timeoutMs ?? 10 * 60_000);
    const onAbort = () => kill("cancelado pelo usuário");
    run.signal?.addEventListener("abort", onAbort, { once: true });

    const events = fs.createWriteStream(path.join(run.workdir, "events.jsonl"), { flags: "a" });
    const handleLine = (line: string) => {
      if (!line.trim()) return;
      events.write(line + "\n");
      try {
        const ev = JSON.parse(line);
        if (ev.type === "thread.started" && ev.thread_id) {
          threadId = ev.thread_id;
          run.onThread?.(ev.thread_id);
        }
        const msg = describeEvent(ev);
        if (msg) run.onLog(msg);
      } catch {
        run.onLog(line);
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      lines.forEach(handleLine);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n"))
        if (line.trim() && !line.startsWith("Reading prompt from stdin")) run.onLog(`[stderr] ${truncate(line, 400)}`);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Não foi possível executar "${CODEX_BIN}": ${err.message}`));
    });
    child.on("close", (code, sig) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      run.signal?.removeEventListener("abort", onAbort);
      handleLine(stdoutBuf);
      events.end();
      if (run.signal?.aborted) return reject(new Error("Cancelado"));

      const direct = path.join(run.workdir, "output.png");
      const outputPath =
        (fs.existsSync(direct) && fs.statSync(direct).size > 0 ? direct : null) ??
        (threadId ? newestImage(path.join(CODEX_HOME, "generated_images", threadId), started) : null);
      if (outputPath) return resolve({ outputPath, threadId });
      reject(new Error(code === 0 ? "O Codex terminou mas nenhuma imagem foi gerada" : `codex saiu com código ${code ?? sig}`));
    });

    child.stdin.end(run.prompt);
  });
}
