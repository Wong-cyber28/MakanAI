import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const analyzeHitsByUser = new Map<string, number[]>();

class PayloadTooLargeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "PayloadTooLargeError";
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRateLimited(userId: string) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const hits = (analyzeHitsByUser.get(userId) ?? []).filter((stamp) => stamp > windowStart);
  if (hits.length >= RATE_LIMIT_MAX) {
    analyzeHitsByUser.set(userId, hits);
    return true;
  }
  hits.push(now);
  analyzeHitsByUser.set(userId, hits);
  return false;
}

async function readJsonBody(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new PayloadTooLargeError();
  }

  const reader = req.body?.getReader();
  if (!reader) {
    throw new Error("Missing request body");
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    received += value.byteLength;
    if (received > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // Ignore cancel errors after rejecting an oversized body.
      }
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder().decode(merged));
}

serve(async (req) => {
  // 处理预检请求 (CORS preflight)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: "Request body too large" }, 413);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";

    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (isRateLimited(user.id)) {
      return jsonResponse({ error: "Too many meal analyses. Please try again later." }, 429);
    }

    const payload = await readJsonBody(req, MAX_BODY_BYTES);
    const { imageBase64, userContext } = (payload ?? {}) as {
      imageBase64?: unknown;
      userContext?: unknown;
    };

    if (typeof imageBase64 !== "string" || !imageBase64) {
      return jsonResponse({ error: "Missing imageBase64 in request body." }, 400);
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY environment variable not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 系统提示词：大马本地化 + 成分拆解 + 双重数学验证
    const systemInstruction = `
You are a senior clinical nutritionist specializing in Malaysian multi-ethnic cuisine (Malay, Chinese, Indian, Mamak, Nyonya).
Your task is to analyze food images taken in Malaysia and extract accurate nutritional data.

CRITICAL LOCALIZED RULES:
1. Hidden Calories Compensation: Account for heavy hidden fats in cooking methods (e.g., Santan/coconut milk in Nasi Lemak and Laksa, Ghee in Roti Canai, Pork Lard/lard oil in Char Kway Teow and Bak Kut Teh). Do not treat them as Western lean food.
2. Portions & Weight: Estimate weights (in grams) for each identified item based on plate proportions.
3. Halal & Dietary Flags:
   - Identify if the dish contains pork, lard, alcohol, or beef.
   - Note if it is strictly non-halal (e.g. traditional hawker Char Kway Teow with lard crisps) or typically halal.
4. Two-Pass Atwater Mathematical Verification:
   - Formula: total_calories = (protein * 4) + (carbs * 4) + (fats * 9).
   - The calculated total based on macros MUST match total_calories within a 5% margin. If not, recalculate and balance the numbers before outputting.

FOOD DETECTION (CRITICAL):
If the image is not edible food or drink (a person, room, receipt, animal, scenery, or random object), do not invent a meal. Return isFood: false, dish_name: "No food detected", all numbers 0, and ingredients [].

INGREDIENT BREAKDOWN (CRITICAL):
If the food is a complex meal (e.g., a lunch tray, economy rice, burger meal), break down the main components into the "ingredients" array, where each object has "name" (string) and "calories" (number). If the food is a single item, a pre-packaged snack, or a beverage, the "ingredients" array MUST be completely empty ([]).

Output MUST be strictly valid JSON matching this schema:
{
  "isFood": true,
  "dish_name": "string (Local name + English/Chinese)",
  "total_calories": number,
  "protein": number,
  "carbs": number,
  "fats": number,
  "ingredients": [
    { "name": "string", "calories": number }
  ]
}
Do not wrap the JSON in markdown. Do not include extra keys unless necessary.
`;

    // 构造请求 Google Gemini 2.5 Flash API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const promptText =
      typeof userContext === "string" && userContext
        ? `${userContext}\n\nAnalyze this Malaysian food image strictly.`
        : `Analyze this Malaysian food image strictly.`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: imageBase64,
              },
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    };

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${errorText}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawContent) {
      return new Response(
        JSON.stringify({ error: "Empty response from Gemini." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsedResult: unknown;
    try {
      const cleaned = String(rawContent)
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
      parsedResult = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: "Gemini returned invalid JSON." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(parsedResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return jsonResponse({ error: "Request body too large" }, 413);
    }
    if (err instanceof SyntaxError) {
      return jsonResponse({ error: "Invalid JSON body." }, 400);
    }
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});