/**
 * anthropic-client.mjs
 * Thin wrapper over @anthropic-ai/sdk with prompt caching and model selection.
 * Provides callCritic(imagePath, prompt) and callFixer(html, bugReport, prompt).
 *
 * Models:
 *   Default (Sonnet):  claude-sonnet-4-6
 *   Escalation (Opus): claude-opus-4-7
 *
 * API key read from environment: ANTHROPIC_API_KEY
 */

import fs from "node:fs";
import path from "node:path";

// Lazy-import to avoid crashing if SDK not installed
let Anthropic;
async function getAnthropic() {
  if (!Anthropic) {
    try {
      const mod = await import("@anthropic-ai/sdk");
      Anthropic = mod.default || mod.Anthropic;
    } catch (err) {
      throw new Error(
        "[anthropic-client] @anthropic-ai/sdk is not installed. Run: npm install @anthropic-ai/sdk"
      );
    }
  }
  return Anthropic;
}

const MODEL_SONNET = "claude-sonnet-4-6";
const MODEL_OPUS   = "claude-opus-4-7";

// Cache for the critic system prompt (shared across calls in one session)
const _cachedSystemPrompts = new Map();

/**
 * Return an Anthropic client instance, reading API key from env.
 */
async function createClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[anthropic-client] ANTHROPIC_API_KEY environment variable is not set."
    );
  }
  const Cls = await getAnthropic();
  return new Cls({ apiKey });
}

/**
 * Encode an image file as base64 for the API.
 * @param {string} imagePath - Absolute path to PNG/JPG.
 * @returns {{ type: "base64", media_type: string, data: string }}
 */
function encodeImage(imagePath) {
  const ext = path.extname(imagePath).toLowerCase().replace(".", "");
  const mediaType = ext === "jpg" || ext === "jpeg"
    ? "image/jpeg"
    : "image/png";
  const data = fs.readFileSync(imagePath).toString("base64");
  return { type: "base64", media_type: mediaType, data };
}

/**
 * Call the visual critic with a screenshot.
 *
 * @param {string} imagePath       - Path to the slide screenshot PNG.
 * @param {string} systemPrompt    - Contents of visual-critic.md (system section).
 * @param {string} userMessage     - Filled-in user message template.
 * @param {object} options
 * @param {boolean} [options.useOpus=false]  - Escalate to Opus when true.
 * @returns {Promise<{ raw: string, parsed: object|null, usage: object }>}
 */
export async function callCritic(imagePath, systemPrompt, userMessage, options = {}) {
  const model = options.useOpus ? MODEL_OPUS : MODEL_SONNET;
  const client = await createClient();

  // Build system block with cache_control (prompt caching — system prompt is stable)
  const systemBlock = _cachedSystemPrompts.has(systemPrompt)
    ? _cachedSystemPrompts.get(systemPrompt)
    : {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" }
      };
  _cachedSystemPrompts.set(systemPrompt, systemBlock);

  const imageSource = encodeImage(imagePath);

  console.log(
    `[critic] model=${model} slide=${path.basename(imagePath)}`
  );

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: [systemBlock],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: imageSource
          },
          {
            type: "text",
            text: userMessage
          }
        ]
      }
    ]
  });

  const raw = response.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  let parsed = null;
  try {
    parsed = JSON.parse(raw.trim());
  } catch (_) {
    console.warn("[critic] Response is not valid JSON:", raw.slice(0, 200));
  }

  return {
    raw,
    parsed,
    usage: {
      input_tokens:  response.usage?.input_tokens  ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      cache_creation_input_tokens:
        response.usage?.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens:
        response.usage?.cache_read_input_tokens ?? 0
    }
  };
}

/**
 * Call the fixer with the slide HTML and bug report.
 *
 * @param {string} html            - Full HTML source of the slide.
 * @param {object} bugReport       - Combined detector + critic report object.
 * @param {string} systemPrompt    - Contents of fixer.md (system section).
 * @param {string} userMessageTpl  - User message template string.
 * @param {object} options
 * @param {boolean} [options.useOpus=false]
 * @returns {Promise<{ raw: string, parsed: object|null, usage: object }>}
 */
export async function callFixer(html, bugReport, systemPrompt, userMessageTpl, options = {}) {
  const model = options.useOpus ? MODEL_OPUS : MODEL_SONNET;
  const client = await createClient();

  // Prompt caching on the fixer system prompt
  const systemBlock = _cachedSystemPrompts.has(systemPrompt)
    ? _cachedSystemPrompts.get(systemPrompt)
    : {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" }
      };
  _cachedSystemPrompts.set(systemPrompt, systemBlock);

  const bugReportJson = JSON.stringify(bugReport, null, 2);

  // Fill in user message template placeholders
  const userMessage = userMessageTpl
    .replace("{BUG_REPORT_JSON}", bugReportJson)
    .replace("{HTML_CONTENT}", html);

  console.log(
    `[fixer] model=${model} iteration=${bugReport.iteration ?? "?"} ` +
    `level_history=${JSON.stringify(bugReport.cascade_level_history ?? [])}`
  );

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: [systemBlock],
    messages: [
      {
        role: "user",
        content: userMessage
      }
    ]
  });

  const raw = response.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  let parsed = null;
  try {
    parsed = JSON.parse(raw.trim());
  } catch (_) {
    // Attempt to extract JSON from a markdown fence block
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        parsed = JSON.parse(fenceMatch[1].trim());
      } catch (__) {
        console.warn("[fixer] Could not parse JSON even from fence block.");
      }
    }
    if (!parsed) {
      console.warn("[fixer] Response is not valid JSON:", raw.slice(0, 200));
    }
  }

  return {
    raw,
    parsed,
    usage: {
      input_tokens:  response.usage?.input_tokens  ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      cache_creation_input_tokens:
        response.usage?.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens:
        response.usage?.cache_read_input_tokens ?? 0
    }
  };
}
