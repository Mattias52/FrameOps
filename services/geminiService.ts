import { SOPStep } from "../types";

const RAILWAY_URL = import.meta.env.VITE_RAILWAY_URL || 'https://frameops-production.up.railway.app';

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

  console.log(`Sending ${frames.length} frames to Railway for Gemini analysis...`);

  try {
    const response = await fetch(`${RAILWAY_URL}/analyze-sop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        frames,
        title,
        additionalContext,
        vitTags
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Railway Gemini analysis failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Gemini analysis failed');
    }

    console.log(`Gemini returned ${result.steps?.length || 0} steps`);
    return result;

  } catch (error: any) {
    console.error("Gemini Pro Analysis Error:", error);
    throw error;
  }
};

export const transcribeAudio = async (textInput: string): Promise<string> => {
  // This function is used for cleaning up transcripts - just return the input for now
  // Could be moved to backend if needed
  return textInput;
};

// Transcribe audio file using Railway backend (for iOS Safari fallback - used by LiveSOPGenerator)
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
    if (mimeType.includes('webm')) {
      mimeType = 'audio/webm';
    } else if (mimeType.includes('mp4')) {
      mimeType = 'audio/mp4';
    }

    console.log(`Sending audio to Railway for transcription: ${(audioBlob.size / 1024).toFixed(1)}KB, type: ${mimeType}`);

    const response = await fetch(`${RAILWAY_URL}/transcribe-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioBase64: base64,
        mimeType
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Railway transcription failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Transcription failed');
    }

    const transcription = result.transcription || '';
    console.log('Transcription result:', transcription.substring(0, 100) + '...');
    return transcription;

  } catch (error: any) {
    console.error('Audio transcription failed:', error);
    // Return empty string instead of throwing - allow SOP generation to continue without transcript
    return '';
  }
};
