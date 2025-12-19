
import { GoogleGenAI, Type } from "@google/genai";
import { PrescriptionItem } from "../types";

// Validate API Key
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing. Please set it in your environment variables.");
}

// Initialize the Google GenAI client with the API key from environment variables.
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

// Helper to parse JSON from potentially markdown-wrapped text
const parseJSON = <T>(text: string): T => {
  try {
    // Remove markdown code blocks if present (e.g., ```json ... ```)
    let cleanText = text.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanText) as T;
  } catch (e) {
    console.error("JSON Parse Error:", e);
    throw new Error("Failed to parse response as JSON");
  }
};

// Function to scan a prescription image and extract medication details including NHI codes.
// 掃描處方箋圖片，並使用搜尋工具查找健保碼。
export const scanPrescription = async (imageBase64: string): Promise<PrescriptionItem[]> => {
  if (!apiKey) {
    alert("尚未設定 API Key，無法使用掃描功能。");
    return [];
  }

  try {
    const cleanImage = imageBase64.split(',')[1] || imageBase64;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            text: `You are an expert pharmacist assistant in Taiwan. Analyze the provided image of a "Chronic Disease Continuous Prescription" (慢性病連續處方箋).
            
            Step 1: Extract the list of medications. For each medication, identify:
            - Name (Prioritize Brand Name).
            - NHI Code (健保代碼): 10-digit codes like "AA58292100", "AC...", "BC...". This is very important.
            - Dosage (e.g., "1.00 CAP" -> "1 顆", "0.5 TAB" -> "0.5 顆").
            - Frequency (e.g., Q12H -> ["09:00", "21:00"], QD -> ["09:00"], PC -> ["13:00"], HS -> ["22:00"]).
            
            Step 2: Do NOT search for images. Browsers block external images due to CORS. Just extract the text and NHI codes accurately so the user can search manually.
            Leave 'imageUrl' empty.

            CRITICAL: You must return ONLY a valid JSON array. Do not use Markdown formatting.
            The JSON structure for each item must be:
            {
              "name": "string",
              "dosage": "string",
              "nhiCode": "string (optional)",
              "imageUrl": "",
              "frequency": "string",
              "suggestedTimes": ["string", "string"]
            }`
          },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanImage
            }
          }
        ]
      },
      // Note: Removed googleSearch tool to speed up response since image fetching is unreliable via API due to CORS.
      // We rely on manual user search in the UI.
    });

    if (response.text) {
      return parseJSON<PrescriptionItem[]>(response.text);
    }
    return [];

  } catch (error) {
    console.error("Prescription Scan Error:", error);
    throw error;
  }
};

// NEW: Function to scan a specific Medicine Bag (藥袋) to extract precise timing.
// 新增：掃描單一藥袋以校正時間。
export const scanMedicineBag = async (imageBase64: string): Promise<{ name: string; times: string[] }> => {
  if (!apiKey) return { name: "", times: [] };

  try {
    const cleanImage = imageBase64.split(',')[1] || imageBase64;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            text: `You are a Taiwanese pharmacist reading a "Medicine Bag" (藥袋).
            
            Task 1: Identify the Drug Name (English Brand Name or Chinese Name).
            Task 2: Identify the usage/frequency instructions (e.g., 每日三次，三餐飯後，睡前，TID, BID).
            Task 3: Convert the frequency into specific 24h times based on this standard:
               - Morning/Breakfast (早) -> "09:00"
               - Noon/Lunch (午) -> "13:00"
               - Evening/Dinner (晚) -> "18:00"
               - Bedtime (睡前) -> "22:00"
               - Twice a day (早晚) -> ["09:00", "18:00"]
               - Three times (三餐) -> ["09:00", "13:00", "18:00"]
               - Four times (三餐 + 睡前) -> ["09:00", "13:00", "18:00", "22:00"]

            Return JSON ONLY:
            {
              "name": "string (The drug name found)",
              "times": ["HH:MM", "HH:MM"]
            }`
          },
          { inlineData: { mimeType: "image/jpeg", data: cleanImage } }
        ]
      }
    });

    if (response.text) {
      return parseJSON<{ name: string; times: string[] }>(response.text);
    }
    return { name: "", times: [] };
  } catch (e) {
    console.error("Medicine Bag Scan Error", e);
    return { name: "", times: [] };
  }
};
