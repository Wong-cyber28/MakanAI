import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // 处理预检请求 (CORS preflight)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";

    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64, userContext } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "Missing imageBase64 in request body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    const promptText = userContext
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
    return new Response(
      JSON.stringify({ error: err.message || "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});