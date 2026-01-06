
export interface DetectionResult {
  label: string;
  score: number;
}

/**
 * Uses Hugging Face Inference API with a Vision Transformer (ViT) model 
 * to detect objects or classify scenes in the SOP frames.
 * Utilizes the provided HF_API_TOKEN for authentication.
 */
export const detectIndustrialObjects = async (base64Image: string): Promise<DetectionResult[]> => {
  // HuggingFace Inference API doesn't support browser CORS
  // Skip vision detection - Railway handles VIT matching for YouTube frames
  // Tags will be extracted by Gemini instead
  console.log("Vision detection skipped (browser CORS limitation)");
  return [];
};
