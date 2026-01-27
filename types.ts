
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
  TERMS = 'terms'
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
  status: 'processing' | 'completed' | 'failed';
  equipmentInfo?: string;
  ppeRequirements?: string[];
  materialsRequired?: string[];
  thumbnail_url?: string;
  allFrames?: FrameOption[];
  videoUrl?: string; // For live recordings - embedded video playback
  videoBlob?: Blob; // Temporary - only used for uploading, not stored
}

export interface AnalysisProgress {
  status: string;
  percentage: number;
}
