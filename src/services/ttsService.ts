import { GoogleGenAI, Modality } from "@google/genai";

export type VoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export interface TTSOptions {
  text: string;
  voice: VoiceName;
  emotion?: string;
  pitch?: number; // 0.5 to 1.5
  isSSML?: boolean;
}

export class TTSService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateSpeech({ text, voice, emotion, pitch = 1.0, isSSML = false }: TTSOptions): Promise<string> {
    let prompt = "";

    if (isSSML) {
      prompt = `Synthesize the following SSML accurately: ${text}`;
    } else {
      let pitchInstruction = "";
      if (pitch < 0.8) pitchInstruction = "in a very low pitch";
      else if (pitch < 0.95) pitchInstruction = "in a low pitch";
      else if (pitch > 1.2) pitchInstruction = "in a very high pitch";
      else if (pitch > 1.05) pitchInstruction = "in a high pitch";

      const instructions = [emotion, pitchInstruction].filter(Boolean).join(" and ");
      prompt = instructions ? `Say ${instructions}: ${text}` : text;
    }

    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio data received from Gemini");
    }

    return base64Audio;
  }
}

export const ttsService = new TTSService();
