// Wire-format for the Ollama Tauri commands.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  top_p?: number;
  seed?: number;
  num_predict?: number;
  /** "json" forces Ollama into structured-output mode. */
  format?: "json" | undefined;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description?: string; enum?: string[] }>;
      required?: string[];
    };
  };
}

export interface ToolCall {
  id?: string;
  function: {
    name: string;
    /** Ollama returns arguments as a structured object directly; if the model
     *  ever returns a JSON string instead, callers should be prepared to parse. */
    arguments: Record<string, unknown> | string;
  };
}

export interface ChatRequest {
  request_id: string;
  model: string;
  messages: ChatMessage[];
  options?: ChatOptions;
  /** Optional system prompt prepended to messages. */
  system?: string;
  /** Enable Gemma 4 "thinking" / reasoning mode. Default false — thinking adds
   *  multiple minutes of pre-output latency on local 31B inference. */
  think?: boolean;
  /** Optional list of tool definitions. Forwarded verbatim to Ollama. */
  tools?: ToolDefinition[];
}
