
export enum AppView {
  LANDING = 'landing',
  CREATOR_LANDING = 'creator_landing',
  DASHBOARD = 'dashboard',
  GENERATOR = 'generator',
  LIVE_GENERATOR = 'live_generator',
  LIBRARY = 'library',
  SETTINGS = 'settings',
  SUBSCRIPTION = 'subscription',
  API_KEYS = 'api_keys',
  PRIVACY = 'privacy',
  TERMS = 'terms',
  // SEO industry pages
  MANUFACTURING = 'manufacturing',
  HEALTHCARE = 'healthcare',
  TRAINING = 'training'
}

export interface SOPStep {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  safetyWarnings?: string[];
  toolsRequired?: string[];
  thumbnail?: string;
  image_url?: string;
  frameIndex?: number; // Gemini-selected frame index for this step (used during mapping)
}

export interface FrameOption {
  timestamp: string;
  imageBase64: string;
}

export interface SOP {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  sourceType: 'upload' | 'youtube' | 'live';
  sourceUrl?: string;
  steps: SOPStep[];
  numSteps?: number; // From database - used when steps not yet loaded (lazy loading)
  status: 'processing' | 'completed' | 'failed';
  equipmentInfo?: string;
  ppeRequirements?: string[];
  materialsRequired?: string[];
  thumbnail_url?: string;
  allFrames?: FrameOption[];
  videoUrl?: string; // For live recordings - embedded video playback
  videoBlob?: Blob; // Temporary - only used for uploading, not stored
  presentationUrl?: string; // Generated presentation video URL
}

export interface AnalysisProgress {
  status: string;
  percentage: number;
}
