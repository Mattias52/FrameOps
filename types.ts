
export enum AppView {
  DASHBOARD = 'dashboard',
  GENERATOR = 'generator',
  LIVE_GENERATOR = 'live_generator',
  LIBRARY = 'library',
  TRANSCRIPTS = 'transcripts',
  SETTINGS = 'settings',
  SUBSCRIPTION = 'subscription'
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
}

export interface AnalysisProgress {
  status: string;
  percentage: number;
}
