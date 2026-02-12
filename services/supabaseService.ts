import { createClient, User, Session } from '@supabase/supabase-js';
import { SOP, SOPStep } from '../types';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Only create client if credentials are provided
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

if (!supabase) {
  console.warn('Supabase credentials missing. Using localStorage fallback.');
}

// ============================================
// AUTH FUNCTIONS
// ============================================

// Get current user
export const getCurrentUser = async (): Promise<User | null> => {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// Get current session
export const getSession = async (): Promise<Session | null> => {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

// Sign in with Google
export const signInWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    }
  });

  if (error) {
    console.error('Google sign in error:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
};

// Sign out
export const signOut = async (): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Sign out error:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
};

// Sign up with email/password
export const signUpWithEmail = async (email: string, password: string): Promise<{ success: boolean; error?: string; needsConfirmation?: boolean }> => {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
    }
  });

  if (error) {
    console.error('Sign up error:', error);
    return { success: false, error: error.message };
  }

  // Check if email confirmation is required
  const needsConfirmation = !data.session;
  return { success: true, needsConfirmation };
};

// Sign in with email/password
export const signInWithEmail = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Sign in error:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
};

// Listen to auth state changes
export const onAuthStateChange = (callback: (user: User | null) => void) => {
  if (!supabase) return { unsubscribe: () => {} };

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });

  return { unsubscribe: () => subscription.unsubscribe() };
};

// Check if Supabase is configured
export const isSupabaseConfigured = () => {
  return Boolean(supabaseUrl && supabaseAnonKey);
};

// Database types matching actual Supabase schema
interface DbLog {
  level: string;
  message: string;
  context?: any;
}

export const logToSupabase = async (message: string, level: string = 'info', context: any = {}) => {
  if (!supabase) return;
  try {
    await supabase.from('system_logs').insert([{ message, level, context }]);
  } catch (e) {
    console.warn('Logging to Supabase failed', e);
  }
};

// Database types matching actual Supabase schema
interface DbSOP {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  source_type: string | null;
  status: string;
  ppe_requirements: string[] | null;
  materials_required: string[] | null;
  user_id: string | null;
  num_steps: number;
  video_url: string | null;
  video_filename: string | null;
  metadata: Record<string, unknown> | null;
  thumbnail_url: string | null;  // Added column
}

interface DbStep {
  id: string;
  sop_id: string;
  step_number: number;  // Original column
  step_order: number | null;  // Added column
  timestamp: string | null;
  heading: string | null;  // Original column
  content: string | null;  // Original column
  title: string | null;  // Added column
  description: string | null;  // Added column
  image_path: string | null;  // Original column
  thumbnail_url: string | null;  // Added column
  safety_warnings: string[] | null;
  tools_required: string[] | null;
  quality_score: number | null;
}

// Convert DB format to app format
const dbToSOP = (dbSop: DbSOP, steps: DbStep[]): SOP => ({
  id: dbSop.id,
  title: dbSop.title,
  description: dbSop.description || '',
  createdAt: dbSop.created_at,
  sourceType: (dbSop.source_type || 'upload') as SOP['sourceType'],
  status: dbSop.status as SOP['status'],
  ppeRequirements: dbSop.ppe_requirements || [],
  materialsRequired: dbSop.materials_required || [],
  thumbnail_url: dbSop.thumbnail_url || undefined,
  videoUrl: dbSop.video_url || undefined,
  numSteps: dbSop.num_steps || steps.length, // For lazy loading
  steps: steps
    .sort((a, b) => (a.step_order ?? a.step_number) - (b.step_order ?? b.step_number))
    .map(s => ({
      id: s.id,
      timestamp: s.timestamp || '',
      title: s.title || s.heading || '',
      description: s.description || s.content || '',
      thumbnail: s.thumbnail_url || s.image_path || undefined,
      image_url: s.thumbnail_url || s.image_path || undefined,
      safetyWarnings: s.safety_warnings || undefined,
      toolsRequired: s.tools_required || undefined,
    })),
});

// Upload thumbnail to Supabase Storage
export const uploadThumbnail = async (
  sopId: string,
  stepId: string,
  base64Data: string
): Promise<string | null> => {
  if (!supabase) return null;

  try {
    // Convert base64 to blob
    const base64Response = await fetch(base64Data);
    const blob = await base64Response.blob();

    const fileName = `${sopId}/${stepId}.jpg`;

    const { error } = await supabase.storage
      .from('thumbnails')
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('Error uploading thumbnail:', error);
      return null;
    }

    // Get public URL
    const { data } = supabase.storage.from('thumbnails').getPublicUrl(fileName);
    return data.publicUrl;
  } catch (err) {
    console.error('Error uploading thumbnail:', err);
    return null;
  }
};

// Upload video to Supabase Storage
export const uploadVideo = async (
  sopId: string,
  videoBlob: Blob
): Promise<string | null> => {
  if (!supabase) return null;

  try {
    const fileName = `${sopId}/recording.webm`;

    console.log(`Uploading video: ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`);

    const { error } = await supabase.storage
      .from('video-uploads')
      .upload(fileName, videoBlob, {
        contentType: 'video/webm',
        upsert: true,
      });

    if (error) {
      console.error('Error uploading video:', error);
      return null;
    }

    // Get public URL
    const { data } = supabase.storage.from('video-uploads').getPublicUrl(fileName);
    console.log('Video uploaded successfully:', data.publicUrl);
    return data.publicUrl;
  } catch (err) {
    console.error('Error uploading video:', err);
    return null;
  }
};

// Delete video from Supabase Storage
export const deleteVideo = async (sopId: string): Promise<boolean> => {
  if (!supabase) return false;

  try {
    const { error } = await supabase.storage
      .from('video-uploads')
      .remove([`${sopId}/recording.webm`]);

    if (error) {
      console.error('Error deleting video:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error deleting video:', err);
    return false;
  }
};

// Fetch SOPs list (metadata only, no steps) - for fast initial load
export const fetchSOPsList = async (limit: number = 20, offset: number = 0): Promise<{ sops: SOP[]; total: number }> => {
  if (!isSupabaseConfigured() || !supabase) return { sops: [], total: 0 };

  try {
    // Get current user - only fetch their SOPs
    const user = await getCurrentUser();
    if (!user) {
      console.log('No user logged in - returning empty SOP list');
      return { sops: [], total: 0 };
    }

    // Get total count for this user
    const { count } = await supabase
      .from('sops')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Fetch SOPs (metadata only) for this user
    const { data: sops, error: sopError } = await supabase
      .from('sops')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (sopError) {
      console.error('Error fetching SOPs:', sopError);
      return { sops: [], total: 0 };
    }

    if (!sops || sops.length === 0) return { sops: [], total: count || 0 };

    // Convert to app format WITHOUT steps (steps loaded on demand)
    const sopList = sops.map(sop => dbToSOP(sop, []));

    console.log(`Loaded ${sopList.length} SOPs (offset: ${offset}, total: ${count})`);
    return { sops: sopList, total: count || 0 };
  } catch (err) {
    console.error('Error fetching SOPs:', err);
    return { sops: [], total: 0 };
  }
};

// Fetch steps for a specific SOP (on demand)
export const fetchSOPSteps = async (sopId: string): Promise<SOPStep[]> => {
  if (!isSupabaseConfigured() || !supabase) return [];

  try {
    const { data: steps, error } = await supabase
      .from('sop_sections')
      .select('*')
      .eq('sop_id', sopId)
      .order('step_order', { ascending: true });

    if (error) {
      console.error('Error fetching steps:', error);
      return [];
    }

    return (steps || []).map(s => ({
      id: s.id,
      timestamp: s.timestamp || '',
      title: s.title || s.heading || '',
      description: s.description || s.content || '',
      thumbnail: s.thumbnail_url || s.image_path || undefined,
      image_url: s.thumbnail_url || s.image_path || undefined,
      safetyWarnings: s.safety_warnings || undefined,
      toolsRequired: s.tools_required || undefined,
    }));
  } catch (err) {
    console.error('Error fetching steps:', err);
    return [];
  }
};

// Fetch all SOPs (legacy - for backwards compatibility, but consider using fetchSOPsList)
export const fetchSOPs = async (): Promise<SOP[]> => {
  if (!isSupabaseConfigured() || !supabase) return [];

  try {
    // Fetch SOPs
    const { data: sops, error: sopError } = await supabase
      .from('sops')
      .select('*')
      .order('created_at', { ascending: false });

    if (sopError) {
      console.error('Error fetching SOPs:', sopError);
      return [];
    }

    if (!sops || sops.length === 0) return [];

    // Fetch all steps for these SOPs with pagination (Supabase has 1000 row default limit)
    const sopIds = sops.map(s => s.id);
    console.log(`Fetching steps for ${sopIds.length} SOPs...`);

    let allSteps: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data: steps, error: stepsError } = await supabase
        .from('sop_sections')
        .select('*')
        .in('sop_id', sopIds)
        .range(from, to);

      if (stepsError) {
        console.error('Error fetching steps:', stepsError);
        return [];
      }

      if (steps && steps.length > 0) {
        allSteps = [...allSteps, ...steps];
        hasMore = steps.length === pageSize;
        page++;
      } else {
        hasMore = false;
      }
    }

    const steps = allSteps;
    console.log(`Fetched ${steps?.length || 0} steps total (${page} pages)`);

    // Group steps by SOP ID
    const stepsBySopId = (steps || []).reduce((acc, step) => {
      if (!acc[step.sop_id]) acc[step.sop_id] = [];
      acc[step.sop_id].push(step);
      return acc;
    }, {} as Record<string, DbStep[]>);

    console.log(`Grouped steps into ${Object.keys(stepsBySopId).length} SOPs`);

    // Convert to app format
    return sops.map(sop => dbToSOP(sop, stepsBySopId[sop.id] || []));
  } catch (err) {
    console.error('Error fetching SOPs:', err);
    return [];
  }
};

// Pick best thumbnail from steps (not first step which is often intro/setup)
const pickBestThumbnail = (steps: SOP['steps']): string | null => {
  if (steps.length === 0) return null;
  // For short SOPs, use first step
  if (steps.length <= 2) {
    return steps[0].thumbnail || steps[0].image_url || null;
  }
  // For longer SOPs, pick a step from early-middle (around 25-33%)
  // This usually shows actual action, not intro setup
  const bestIndex = Math.min(Math.floor(steps.length / 3), steps.length - 1);
  const bestStep = steps[bestIndex];
  return bestStep.thumbnail || bestStep.image_url || steps[0].thumbnail || steps[0].image_url || null;
};

// Save a new SOP (with optional video blob for live recordings)
export const saveSOP = async (sop: SOP, videoBlob?: Blob): Promise<{ success: boolean; id?: string; videoUrl?: string; requiresLogin?: boolean }> => {
  if (!isSupabaseConfigured() || !supabase) return { success: false };

  try {
    // Get current user
    const user = await getCurrentUser();
    if (!user) {
      console.warn('No user logged in - SOP will not be saved');
      return { success: false, requiresLogin: true };
    }

    // Insert SOP - let database generate UUID
    const { data: insertedSop, error: sopError } = await supabase
      .from('sops')
      .insert({
        title: sop.title,
        description: sop.description || null,
        source_type: sop.sourceType || 'upload',
        status: sop.status || 'completed',
        ppe_requirements: sop.ppeRequirements || null,
        materials_required: sop.materialsRequired || null,
        num_steps: sop.steps.length,
        thumbnail_url: sop.thumbnail_url || pickBestThumbnail(sop.steps),
        user_id: user.id,
      })
      .select('id')
      .single();

    if (sopError || !insertedSop) {
      console.error('Error saving SOP:', sopError);
      return { success: false };
    }

    const sopId = insertedSop.id;

    // Upload video if provided (for live recordings)
    let videoUrl: string | null = null;
    if (videoBlob && videoBlob.size > 0) {
      console.log('Uploading video for live SOP...');
      videoUrl = await uploadVideo(sopId, videoBlob);

      if (videoUrl) {
        // Update SOP with video URL
        await supabase
          .from('sops')
          .update({ video_url: videoUrl })
          .eq('id', sopId);
      }
    }

    // Upload thumbnails and insert steps
    const stepsToInsert = await Promise.all(
      sop.steps.map(async (step, index) => {
        let thumbnailUrl: string | null = null;

        // Upload thumbnail if it's a base64 image
        if (step.thumbnail?.startsWith('data:image')) {
          thumbnailUrl = await uploadThumbnail(sopId, step.id, step.thumbnail);
        } else if (step.thumbnail) {
          thumbnailUrl = step.thumbnail;
        }

        return {
          sop_id: sopId,
          step_number: index + 1,  // Original column (1-indexed)
          step_order: index,  // Added column (0-indexed)
          timestamp: step.timestamp || null,
          heading: step.title,  // Original column
          content: step.description,  // Original column
          title: step.title,  // Added column
          description: step.description,  // Added column
          image_path: thumbnailUrl,  // Original column
          thumbnail_url: thumbnailUrl,  // Added column
          safety_warnings: step.safetyWarnings || null,
          tools_required: step.toolsRequired || null,
        };
      })
    );

    const { error: stepsError } = await supabase.from('sop_sections').insert(stepsToInsert);

    if (stepsError) {
      console.error('Error saving steps:', stepsError);
      // Try to rollback SOP
      await supabase.from('sops').delete().eq('id', sopId);
      return { success: false };
    }

    return { success: true, id: sopId, videoUrl: videoUrl || undefined };
  } catch (err) {
    console.error('Error saving SOP:', err);
    return { success: false };
  }
};

// Update an existing SOP
export const updateSOP = async (sop: SOP): Promise<{ success: boolean }> => {
  if (!isSupabaseConfigured() || !supabase) return { success: false };

  try {
    // Update SOP metadata
    const { error: sopError } = await supabase
      .from('sops')
      .update({
        title: sop.title,
        description: sop.description || null,
        ppe_requirements: sop.ppeRequirements || null,
        materials_required: sop.materialsRequired || null,
        num_steps: sop.steps.length,
        thumbnail_url: sop.thumbnail_url || pickBestThumbnail(sop.steps),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sop.id);

    if (sopError) {
      console.error('Error updating SOP:', sopError);
      return { success: false };
    }

    // Delete existing steps
    await supabase.from('sop_sections').delete().eq('sop_id', sop.id);

    // Upload thumbnails and insert updated steps
    const stepsToInsert = await Promise.all(
      sop.steps.map(async (step, index) => {
        let thumbnailUrl: string | null = null;

        // Upload thumbnail if it's a base64 image (new upload)
        if (step.thumbnail?.startsWith('data:image')) {
          thumbnailUrl = await uploadThumbnail(sop.id, step.id, step.thumbnail);
        } else if (step.image_url?.startsWith('data:image')) {
          thumbnailUrl = await uploadThumbnail(sop.id, step.id, step.image_url);
        } else if (step.thumbnail || step.image_url) {
          thumbnailUrl = step.thumbnail || step.image_url || null;
        }

        return {
          sop_id: sop.id,
          step_number: index + 1,
          step_order: index,
          timestamp: step.timestamp || null,
          heading: step.title,
          content: step.description,
          title: step.title,
          description: step.description,
          image_path: thumbnailUrl,
          thumbnail_url: thumbnailUrl,
          safety_warnings: step.safetyWarnings || null,
          tools_required: step.toolsRequired || null,
        };
      })
    );

    const { error: stepsError } = await supabase.from('sop_sections').insert(stepsToInsert);

    if (stepsError) {
      console.error('Error updating steps:', stepsError);
      return { success: false };
    }

    return { success: true };
  } catch (err) {
    console.error('Error updating SOP:', err);
    return { success: false };
  }
};

// Delete a SOP
export const deleteSOP = async (sopId: string): Promise<boolean> => {
  if (!isSupabaseConfigured() || !supabase) return false;

  try {
    // Delete steps first (foreign key)
    await supabase.from('sop_sections').delete().eq('sop_id', sopId);

    // Delete thumbnails from storage
    const { data: files } = await supabase.storage.from('thumbnails').list(sopId);
    if (files && files.length > 0) {
      const filePaths = files.map(f => `${sopId}/${f.name}`);
      await supabase.storage.from('thumbnails').remove(filePaths);
    }

    // Delete video from storage (for live recordings)
    await deleteVideo(sopId);

    // Delete SOP
    const { error } = await supabase.from('sops').delete().eq('id', sopId);

    if (error) {
      console.error('Error deleting SOP:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error deleting SOP:', err);
    return false;
  }
};
