
import { GoogleGenAI, Type } from "@google/genai";
import { SOPStep } from "../types";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

// Lazy initialization to avoid crash on missing key
let _ai: GoogleGenAI | null = null;
const getAI = () => {
  if (!_ai) {
    if (!apiKey) {
      throw new Error("Gemini API key not configured. Set VITE_GEMINI_API_KEY in environment.");
    }
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
};

export const analyzeSOPFrames = async (
  frames: string[], 
  title: string, 
  additionalContext: string = "",
  vitTags: string[] = []
): Promise<{ 
  title: string; 
  description: string; 
  steps: SOPStep[];
  ppeRequirements: string[];
  materialsRequired: string[];
}> => {
  
  if (!frames || frames.length === 0) {
    throw new Error("No frames provided for analysis.");
  }

  const validImageParts = frames
    .filter(f => f && (f.includes('base64,') || f.startsWith('http')))
    .map(f => {
      if (f.includes('base64,')) {
        const parts = f.split('base64,');
        return {
          inlineData: {
            mimeType: "image/jpeg",
            data: parts[1]
          }
        };
      }
      return null;
    })
    .filter(p => p !== null);

  if (validImageParts.length === 0) {
    throw new Error("No valid image data found for analysis.");
  }

  // Inject ViT tags into the prompt as ground truth visual evidence
  const vitContext = vitTags.length > 0 
    ? `PRECISION VISION TAGS (Detected via ViT): ${vitTags.join(", ")}. These items are positively identified in the video.` 
    : "";

  const prompt = `You are an expert technical writer creating a Standard Operating Procedure (SOP) document.

CRITICAL INSTRUCTIONS - READ CAREFULLY:
1. I am providing you with ${validImageParts.length} images (frames from a video)
2. The video/procedure is titled: "${title}"
3. You MUST analyze EACH image and create ONE step per image
4. Return EXACTLY ${validImageParts.length} steps - no more, no less

${additionalContext ? `ADDITIONAL CONTEXT: ${additionalContext}` : ''}
${vitContext}

FOR EACH IMAGE/STEP:
- Look at what is physically shown in the image
- Write an actionable title starting with a verb (e.g., "Connect the power cable", "Tighten the bolt", "Verify the alignment")
- Write a detailed description explaining:
  * What action is being performed
  * What tools or hands are visible
  * What components or parts are involved
  * Any safety concerns visible
- If you see safety hazards, add them to safetyWarnings
- If you see tools being used, add them to toolsRequired

ALSO PROVIDE:
- An overall title for this procedure
- A brief description summarizing the entire procedure
- A list of PPE (Personal Protective Equipment) requirements based on what you observe
- A list of materials/tools required for the entire procedure

Remember: Analyze the actual visual content of each image. Do not make up steps that aren't shown.`;


  try {
    // IMPORTANT: Put text prompt FIRST, then images - this helps Gemini follow instructions better
    const response = await getAI().models.generateContent({
      model: "gemini-2.0-flash",
      contents: {
        parts: [
          { text: prompt },
          ...validImageParts as any
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            ppeRequirements: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }
            },
            materialsRequired: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }
            },
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  timestamp: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  safetyWarnings: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING } 
                  },
                  toolsRequired: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING } 
                  }
                },
                required: ["id", "title", "description", "timestamp"]
              }
            }
          },
          required: ["title", "description", "steps", "ppeRequirements", "materialsRequired"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from Gemini Pro.");
    return JSON.parse(text.trim());
  } catch (error: any) {
    console.error("Gemini Pro Analysis Error:", error);
    throw error;
  }
};

export const transcribeAudio = async (textInput: string): Promise<string> => {
  const response = await getAI().models.generateContent({
    model: "gemini-2.0-flash",
    contents: `Transform this raw technical transcript into a high-quality, structured summary: ${textInput}`
  });
  return response.text || "Transcription unavailable.";
};

// Transcribe audio file using Gemini (for iOS Safari fallback - used by LiveSOPGenerator)
export const transcribeAudioFile = async (audioBlob: Blob): Promise<string> => {
  try {
    // Convert blob to base64 robustly
    const arrayBuffer = await audioBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    // Determine mime type
    let mimeType = audioBlob.type || 'audio/webm';
    // Gemini supports: audio/wav, audio/mp3, audio/aiff, audio/aac, audio/ogg, audio/flac
    // Map common types
    if (mimeType.includes('webm')) {
      mimeType = 'audio/webm';
    } else if (mimeType.includes('mp4')) {
      mimeType = 'audio/mp4';
    }

    console.log(`Transcribing audio: ${(audioBlob.size / 1024).toFixed(1)}KB, type: ${mimeType}`);

    const response = await getAI().models.generateContent({
      model: "gemini-2.0-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64
            }
          },
          {
            text: `Transcribe this audio recording accurately. The speaker is explaining a technical procedure or demonstration.

Rules:
- Output ONLY the transcription text, no timestamps or speaker labels
- Keep the original language (don't translate)
- Include all spoken words, even filler words if they help context
- If audio is unclear, do your best to interpret
- If there is no speech, return an empty string.

Output the transcription:`
          }
        ]
      }
    });

    const transcription = response.text?.trim() || '';
    console.log('Transcription result:', transcription.substring(0, 100) + '...');
    return transcription;
  } catch (error: any) {
    console.error('Audio transcription failed:', error);
    // Return empty string instead of throwing - allow SOP generation to continue without transcript
    return '';
  }
};
