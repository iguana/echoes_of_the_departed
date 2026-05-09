// Streaming Ollama client.
//
// The frontend invokes `ollama_chat_stream` with a unique request_id and listens for:
//   - `ollama:token:<request_id>`     String   each delta chunk of assistant content
//   - `ollama:resolved:<request_id>`  ()       inline [RESOLVED] marker fired
//   - `ollama:banished:<request_id>`  ()       inline [BANISHED] marker fired
//   - `ollama:toolcall:<request_id>`  json     a tool call from the model
//   - `ollama:done:<request_id>`      ()       stream complete
//   - `ollama:error:<request_id>`     String   error message; stream aborted
//
// Cancel a stream mid-flight via `ollama_cancel(request_id)` — used when the player
// walks away from an NPC mid-dialogue.

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::Window;

use crate::AppState;

const OLLAMA_BASE: &str = "http://127.0.0.1:11434";

/// Inline control tokens the model can emit at end-of-message to signal an
/// out-of-band event (séance resolution / banishment). Stripped from the
/// streamed text before it reaches the typewriter; surfaced as separate
/// frontend events. Keep these in sync with `src/ghosts/prompt.ts`.
const MARKERS: &[(&str, &str)] = &[
    ("[RESOLVED]", "ollama:resolved:"),
    ("[BANISHED]", "ollama:banished:"),
];

/// Largest marker length, used to size the lookback buffer when emitting
/// safe content (we never emit the trailing N chars in case they're a
/// partial marker that finishes in the next chunk).
const MAX_MARKER_LEN: usize = 12;

/// Stream filter that strips control markers and fires per-marker events.
struct MarkerFilter {
    pending: String,
}

impl MarkerFilter {
    fn new() -> Self { Self { pending: String::new() } }

    /// Feed new content. Emits sanitized text via `emit_text` and one
    /// signal per detected marker via `emit_marker`. Holds back the trailing
    /// few chars so a marker straddling a chunk boundary is still detected.
    fn feed(
        &mut self,
        chunk: &str,
        mut emit_text: impl FnMut(String),
        mut emit_marker: impl FnMut(&'static str),
    ) {
        self.pending.push_str(chunk);
        loop {
            let mut found: Option<(usize, &'static str, &'static str)> = None;
            for (marker, evt) in MARKERS {
                if let Some(pos) = self.pending.find(*marker) {
                    if let Some((bp, _, _)) = found {
                        if pos >= bp { continue; }
                    }
                    found = Some((pos, *marker, *evt));
                }
            }
            match found {
                None => break,
                Some((pos, marker, evt)) => {
                    if pos > 0 {
                        let before: String = self.pending.drain(..pos).collect();
                        emit_text(before);
                    }
                    self.pending.drain(..marker.len());
                    emit_marker(evt);
                }
            }
        }
        // Emit everything except the last MAX_MARKER_LEN chars (which might
        // become a marker once the next chunk arrives).
        if self.pending.len() > MAX_MARKER_LEN {
            let safe_byte_len = floor_char_boundary(&self.pending, self.pending.len() - MAX_MARKER_LEN);
            if safe_byte_len > 0 {
                let chunk: String = self.pending.drain(..safe_byte_len).collect();
                emit_text(chunk);
            }
        }
    }

    /// End of stream — flush whatever's left.
    fn flush(&mut self, mut emit_text: impl FnMut(String)) {
        if !self.pending.is_empty() {
            emit_text(std::mem::take(&mut self.pending));
        }
    }
}

/// Find the largest valid char boundary at or below `idx`. Avoids panicking
/// when `drain(..idx)` would split a multi-byte UTF-8 sequence.
fn floor_char_boundary(s: &str, mut idx: usize) -> usize {
    while idx > 0 && !s.is_char_boundary(idx) { idx -= 1; }
    idx
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct ChatOptions {
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub seed: Option<u64>,
    pub num_predict: Option<i32>,
    /// "json" forces Ollama into structured-output mode.
    pub format: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub request_id: String,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub options: Option<ChatOptions>,
    /// Optional per-request system prompt prepended to messages.
    pub system: Option<String>,
    /// Whether to enable model "thinking" (Gemma 4 reasoning step). Defaults to
    /// false — thinking mode adds minutes of pre-output latency on local 31B.
    #[serde(default)]
    pub think: bool,
    /// Optional list of tool definitions forwarded verbatim to Ollama. Each
    /// tool follows the OpenAI function-calling shape:
    /// `{ "type": "function", "function": { "name", "description", "parameters" } }`.
    #[serde(default)]
    pub tools: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct OllamaStreamChunk {
    message: Option<OllamaStreamMessage>,
    done: bool,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OllamaStreamMessage {
    #[serde(default)]
    content: String,
    #[serde(default)]
    tool_calls: Vec<OllamaToolCall>,
}

/// Shape from Ollama: `{ "id": "call_…", "function": { "name", "arguments": object } }`.
/// We forward this verbatim to the frontend.
#[derive(Debug, Deserialize, Serialize, Clone)]
struct OllamaToolCall {
    #[serde(default)]
    id: Option<String>,
    function: OllamaToolCallFn,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct OllamaToolCallFn {
    name: String,
    /// Ollama gives us this as a structured object; OpenAI uses a JSON string.
    /// We accept either by deserializing as `serde_json::Value`.
    #[serde(default)]
    arguments: serde_json::Value,
}

/// Health probe: GET /api/tags (lists installed models).
/// Returns the installed model names so the UI can show what's available.
#[tauri::command]
pub async fn ollama_health() -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(format!("{}/api/tags", OLLAMA_BASE))
        .send()
        .await
        .map_err(|e| format!("Ollama not reachable at {}: {}", OLLAMA_BASE, e))?;
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let models = v
        .get("models")
        .and_then(|m| m.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();
    Ok(models)
}

/// Cancel an in-flight streaming chat by request_id. No-op if unknown id.
#[tauri::command]
pub async fn ollama_cancel(state: tauri::State<'_, AppState>, request_id: String) -> Result<(), String> {
    let mut map = state.cancellations.lock().await;
    if let Some(tx) = map.remove(&request_id) {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub async fn ollama_chat_stream(
    window: Window,
    state: tauri::State<'_, AppState>,
    req: ChatRequest,
) -> Result<(), String> {
    let request_id = req.request_id.clone();
    let token_evt = format!("ollama:token:{}", request_id);
    let done_evt = format!("ollama:done:{}", request_id);
    let err_evt = format!("ollama:error:{}", request_id);

    // Register cancellation channel
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
    state.cancellations.lock().await.insert(request_id.clone(), cancel_tx);

    // Build messages with optional system prompt prepended
    let mut messages = Vec::with_capacity(req.messages.len() + 1);
    if let Some(sys) = &req.system {
        messages.push(ChatMessage { role: "system".into(), content: sys.clone() });
    }
    messages.extend(req.messages.iter().cloned());

    let opts = req.options.as_ref();
    let mut body = serde_json::json!({
        "model": req.model,
        "messages": messages,
        "stream": true,
        "think": req.think,
        "format": opts.and_then(|o| o.format.as_deref()),
        "options": {
            "temperature": opts.and_then(|o| o.temperature).unwrap_or(0.7),
            "top_p": opts.and_then(|o| o.top_p).unwrap_or(0.9),
            "seed": opts.and_then(|o| o.seed),
            "num_predict": opts.and_then(|o| o.num_predict).unwrap_or(-1),
        }
    });
    if !req.tools.is_empty() {
        body["tools"] = serde_json::Value::Array(req.tools.clone());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;

    let send_result = client
        .post(format!("{}/api/chat", OLLAMA_BASE))
        .json(&body)
        .send()
        .await;

    let response = match send_result {
        Ok(r) => r,
        Err(e) => {
            let _ = window.emit(&err_evt, format!("ollama request failed: {}", e));
            state.cancellations.lock().await.remove(&request_id);
            return Ok(());
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let _ = window.emit(&err_evt, format!("ollama HTTP {}: {}", status, text));
        state.cancellations.lock().await.remove(&request_id);
        return Ok(());
    }

    let mut stream = response.bytes_stream();
    let mut buf = String::new();
    let mut filter = MarkerFilter::new();
    let req_id_for_marker = request_id.clone();
    let win_for_text = window.clone();
    let win_for_marker = window.clone();
    let token_evt_for_filter = token_evt.clone();
    let toolcall_evt = format!("ollama:toolcall:{}", request_id);

    let mut emit_text_box = |s: String| {
        let _ = win_for_text.emit(&token_evt_for_filter, s);
    };
    let mut emit_marker_box = |evt_prefix: &'static str| {
        let _ = win_for_marker.emit(&format!("{}{}", evt_prefix, req_id_for_marker), ());
    };

    loop {
        tokio::select! {
            biased;
            _ = &mut cancel_rx => {
                filter.flush(&mut emit_text_box);
                let _ = window.emit(&err_evt, "cancelled".to_string());
                state.cancellations.lock().await.remove(&request_id);
                return Ok(());
            }
            next = stream.next() => {
                match next {
                    None => break,
                    Some(Err(e)) => {
                        let _ = window.emit(&err_evt, format!("stream error: {}", e));
                        state.cancellations.lock().await.remove(&request_id);
                        return Ok(());
                    }
                    Some(Ok(bytes)) => {
                        buf.push_str(&String::from_utf8_lossy(&bytes));
                        while let Some(nl) = buf.find('\n') {
                            let line: String = buf.drain(..=nl).collect();
                            let line = line.trim();
                            if line.is_empty() { continue; }
                            match serde_json::from_str::<OllamaStreamChunk>(line) {
                                Ok(c) => {
                                    if let Some(err) = c.error {
                                        let _ = window.emit(&err_evt, err);
                                        state.cancellations.lock().await.remove(&request_id);
                                        return Ok(());
                                    }
                                    if let Some(msg) = c.message {
                                        if !msg.content.is_empty() {
                                            filter.feed(&msg.content, &mut emit_text_box, &mut emit_marker_box);
                                        }
                                        for tc in msg.tool_calls.iter() {
                                            let _ = window.emit(&toolcall_evt, tc.clone());
                                        }
                                    }
                                    if c.done {
                                        filter.flush(&mut emit_text_box);
                                        let _ = window.emit(&done_evt, ());
                                        state.cancellations.lock().await.remove(&request_id);
                                        return Ok(());
                                    }
                                }
                                Err(e) => {
                                    let _ = window.emit(&err_evt, format!("parse error: {} (line: {})", e, line));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    filter.flush(&mut emit_text_box);
    let _ = window.emit(&done_evt, ());
    state.cancellations.lock().await.remove(&request_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn collect(s: &str) -> (String, Vec<&'static str>) {
        let mut text = String::new();
        let mut markers = Vec::new();
        let mut filter = MarkerFilter::new();
        // Feed in 3-char chunks to exercise straddling.
        let chars: Vec<char> = s.chars().collect();
        for window in chars.chunks(3) {
            let chunk: String = window.iter().collect();
            filter.feed(
                &chunk,
                |t| text.push_str(&t),
                |evt| markers.push(evt),
            );
        }
        filter.flush(|t| text.push_str(&t));
        (text, markers)
    }

    #[test]
    fn passes_text_unchanged() {
        let (t, m) = collect("Hello, medium. I cannot stay long.");
        assert_eq!(t, "Hello, medium. I cannot stay long.");
        assert!(m.is_empty());
    }

    #[test]
    fn strips_resolved_at_end() {
        let (t, m) = collect("Thank you. I can rest now.[RESOLVED]");
        assert_eq!(t, "Thank you. I can rest now.");
        assert_eq!(m, vec!["ollama:resolved:"]);
    }

    #[test]
    fn strips_banished_mid_split() {
        // The marker straddles 3-char chunk boundaries
        let (t, m) = collect("Begone![BANISHED]");
        assert_eq!(t, "Begone!");
        assert_eq!(m, vec!["ollama:banished:"]);
    }

    #[test]
    fn handles_marker_at_start() {
        let (t, m) = collect("[RESOLVED]");
        assert_eq!(t, "");
        assert_eq!(m, vec!["ollama:resolved:"]);
    }
}
