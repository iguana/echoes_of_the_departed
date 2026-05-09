// Frontend wrapper around the Rust Ollama commands.
//
// Two surfaces:
//   - chatCollect: stream tokens internally, resolve with the full string. Used for
//     level generation (we want the whole JSON before validating).
//   - chatStream: forward tokens to a callback. Used for NPC dialogue (typewriter).

import { invoke } from "@tauri-apps/api/tauri";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ChatMessage, ChatOptions, ChatRequest, ToolCall, ToolDefinition } from "./types";

export type { ToolCall, ToolDefinition } from "./types";

let counter = 0;
function nextRequestId(prefix = "req"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export interface ChatStreamCallbacks {
  onToken?: (delta: string) => void;
  onError?: (msg: string) => void;
  onDone?: () => void;
  /** Fired if the model emitted [RESOLVED] (séance peace). The token itself is
   *  stripped from the text stream before reaching onToken. */
  onResolved?: () => void;
  /** Fired if the model emitted [BANISHED] (séance failure). */
  onBanished?: () => void;
  /** Fired for each structured tool call the model emits during the stream. */
  onToolCall?: (call: ToolCall) => void;
}

export interface ChatStreamHandle {
  /** Promise resolves with the full assembled assistant content on completion. */
  done: Promise<string>;
  /** Cancel mid-flight. Settles `done` with whatever was assembled so far. */
  cancel: () => Promise<void>;
  request_id: string;
}

export interface OllamaArgs {
  model: string;
  messages: ChatMessage[];
  system?: string;
  options?: ChatOptions;
  /** Enable Gemma 4 thinking mode. Default false — thinking-on adds many
   *  minutes of pre-output latency on local 31B. */
  think?: boolean;
  /** Tool definitions Gemma may call during the conversation. Each call is
   *  delivered via the onToolCall stream callback. */
  tools?: ToolDefinition[];
  /** Custom request id; auto-generated if omitted. */
  request_id?: string;
}

/** List installed models. Returns empty array if Ollama is unreachable. */
export async function ollamaHealth(): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const models = await invoke<string[]>("ollama_health");
    return { ok: true, models };
  } catch (e) {
    return { ok: false, models: [], error: String(e) };
  }
}

/** Stream a chat completion. Tokens flow through onToken; when the stream ends,
 *  the `done` promise resolves with the full content. */
export function chatStream(args: OllamaArgs, cb: ChatStreamCallbacks = {}): ChatStreamHandle {
  const request_id = args.request_id ?? nextRequestId("chat");
  const tokenEvt = `ollama:token:${request_id}`;
  const doneEvt = `ollama:done:${request_id}`;
  const errEvt = `ollama:error:${request_id}`;

  const resolvedEvt = `ollama:resolved:${request_id}`;
  const banishedEvt = `ollama:banished:${request_id}`;
  const toolcallEvt = `ollama:toolcall:${request_id}`;

  let acc = "";
  let unlistenToken: UnlistenFn | null = null;
  let unlistenDone: UnlistenFn | null = null;
  let unlistenError: UnlistenFn | null = null;
  let unlistenResolved: UnlistenFn | null = null;
  let unlistenBanished: UnlistenFn | null = null;
  let unlistenToolCall: UnlistenFn | null = null;

  const cleanup = () => {
    unlistenToken?.();
    unlistenDone?.();
    unlistenError?.();
    unlistenResolved?.();
    unlistenBanished?.();
    unlistenToolCall?.();
    unlistenToken = unlistenDone = unlistenError = unlistenResolved = unlistenBanished = unlistenToolCall = null;
  };

  const done = new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const setup = async () => {
      unlistenToken = await listen<string>(tokenEvt, (e) => {
        acc += e.payload;
        cb.onToken?.(e.payload);
      });
      unlistenResolved = await listen<null>(resolvedEvt, () => {
        cb.onResolved?.();
      });
      unlistenBanished = await listen<null>(banishedEvt, () => {
        cb.onBanished?.();
      });
      unlistenToolCall = await listen<ToolCall>(toolcallEvt, (e) => {
        cb.onToolCall?.(e.payload);
      });
      unlistenDone = await listen<null>(doneEvt, () => {
        finish(() => {
          cb.onDone?.();
          resolve(acc);
        });
      });
      unlistenError = await listen<string>(errEvt, (e) => {
        finish(() => {
          cb.onError?.(e.payload);
          if (e.payload === "cancelled") resolve(acc);
          else reject(new Error(e.payload));
        });
      });

      const req: ChatRequest = {
        request_id,
        model: args.model,
        messages: args.messages,
        options: args.options,
        system: args.system,
        think: args.think ?? false,
        tools: args.tools,
      };
      try {
        await invoke("ollama_chat_stream", { req });
      } catch (e) {
        finish(() => reject(e instanceof Error ? e : new Error(String(e))));
      }
    };
    void setup();
  });

  return {
    done,
    request_id,
    cancel: async () => {
      try {
        await invoke("ollama_cancel", { requestId: request_id });
      } catch {
        // ignore — stream may have already ended
      }
    },
  };
}

/** Convenience: stream-and-collect. Resolves with full content. */
export async function chatCollect(
  args: OllamaArgs,
  onProgress?: (delta: string, accumulated: string) => void,
): Promise<string> {
  let acc = "";
  const handle = chatStream(args, {
    onToken: (delta) => {
      acc += delta;
      onProgress?.(delta, acc);
    },
  });
  return handle.done;
}

export type { ChatMessage, ChatOptions } from "./types";
