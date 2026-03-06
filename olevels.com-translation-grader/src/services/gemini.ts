import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AccentAnalysis {
  accent: string;
  accentBreakdown: { label: string; percentage: number }[];
  mistakes: string[];
  strengths: string[];
  improvements: string[];
  transcription: string;
  overallFeedback: string;
}

export async function analyzeAccent(audioBase64: string, mimeType: string): Promise<AccentAnalysis> {
  const contents = [
    {
      parts: [
        {
          inlineData: {
            data: audioBase64,
            mimeType: mimeType,
          },
        },
        {
          text: "Analyze the provided audio of a person speaking English. First, accurately transcribe the audio word-for-word. Then, identify the likely accent and provide a breakdown of accent influences based on phonetic markers. Crucially, classify the accents using specific country or linguistic labels rather than broad regions. You must consider a wide range of specific accents including, but not limited to: American, British, Indian/Pakistani, Arabic, Chinese, Japanese, Nigerian, Russian, French, Spanish, Italian, Australian, South African, etc. Use American English as the default reference standard. List specific pronunciation mistakes, but ALSO list the 'strengths' or 'good parts' of their speech. Provide actionable advice on how to improve. Return the response in JSON format.",
        },
      ],
    },
  ];

  const config = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        accent: { type: Type.STRING, description: "The primary detected accent" },
        accentBreakdown: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING, description: "Accent name (e.g., American)" },
              percentage: { type: Type.NUMBER, description: "Percentage value (0-100)" },
            },
            required: ["label", "percentage"],
          },
          description: "Breakdown of accent influences"
        },
        mistakes: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "List of specific mistakes" 
        },
        strengths: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "List of good parts/strengths in the speech" 
        },
        improvements: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "List of improvement suggestions" 
        },
        transcription: { type: Type.STRING, description: "Transcription of the audio" },
        overallFeedback: { type: Type.STRING, description: "General summary of the speech quality" },
      },
      required: ["accent", "accentBreakdown", "mistakes", "strengths", "improvements", "transcription", "overallFeedback"],
    },
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents,
      config
    });
    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text) as AccentAnalysis;
  } catch (error: any) {
    const errorMessage = error?.message || JSON.stringify(error);
    if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
      console.warn("Pro model quota exceeded. Falling back to Flash model...");
      const fallbackResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents,
        config
      });
      const text = fallbackResponse.text;
      if (!text) throw new Error("No response from AI");
      return JSON.parse(text) as AccentAnalysis;
    }
    throw error;
  }
}
