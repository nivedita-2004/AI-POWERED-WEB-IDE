const DEFAULT_AI_MODEL = "gpt-4o-mini";

interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function generateAIText(
  messages: AIMessage[],
  options: { maxTokens?: number; temperature?: number; topP?: number } = {},
): Promise<string> {
  const apiKey = process.env.AI_API_KEY;
  const apiUrl = process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
  const model = process.env.AI_MODEL || DEFAULT_AI_MODEL;

  if (!apiKey) {
    throw new Error("AI_API_KEY is not configured");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.9,
      max_tokens: options.maxTokens ?? 1000,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorBody = await response.text();

    console.error("OpenAI API Error:", {
        status: response.status,
        body: errorBody,
    });

    throw new Error(`AI service error: ${response.status} - ${errorBody}`);
}

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("AI service returned an empty response");
  }

  return content;
}
