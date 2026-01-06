
import React, { useState } from 'react';
import { transcribeAudio } from '../services/geminiService';

const Transcripts: React.FC = () => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleTranscribe = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    try {
      const result = await transcribeAudio(input);
      setOutput(result);
    } catch (err) {
      console.error(err);
      setOutput("Error processing transcript.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center text-xl shadow-sm">
          <i className="fas fa-microphone-lines"></i>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Transcript Optimizer</h1>
          <p className="text-slate-500">Transform messy audio transcripts into clean technical summaries.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Raw Transcript Input</label>
          <textarea 
            className="w-full h-[500px] p-6 bg-white border border-slate-200 rounded-3xl shadow-sm focus:ring-2 focus:ring-indigo-500 transition-all resize-none font-mono text-sm leading-relaxed"
            placeholder="Paste your raw video transcript here... e.g. 'So basically you want to unscrew this part first then grab the wrench...'"
            value={input}
            // Fix: Cast e.target to any to access value safely in restricted type environment
            onChange={(e) => setInput((e.target as any).value)}
          ></textarea>
          <button 
            onClick={handleTranscribe}
            disabled={isLoading || !input.trim()}
            className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-3"
          >
            {isLoading ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                Processing...
              </>
            ) : (
              <>
                <i className="fas fa-wand-magic-sparkles"></i>
                Clean Transcript
              </>
            )}
          </button>
        </div>

        <div className="space-y-4">
          <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Optimized Procedure</label>
          <div className="w-full h-[500px] p-6 bg-slate-900 text-indigo-100 border border-slate-800 rounded-3xl shadow-sm overflow-y-auto leading-relaxed">
            {output ? (
              <div className="prose prose-invert prose-sm">
                <p className="whitespace-pre-wrap">{output}</p>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center px-8">
                <i className="fas fa-terminal text-4xl mb-4"></i>
                <p>Cleaned documentation will appear here after processing.</p>
              </div>
            )}
          </div>
          <button 
            disabled={!output}
            onClick={() => {
              // Fix: Reference navigator.clipboard via window to bypass missing types
              (window as any).navigator.clipboard.writeText(output);
              // Fix: Reference alert via window
              (window as any).alert("Copied to clipboard!");
            }}
            className="w-full py-4 bg-white border border-slate-200 text-slate-700 font-bold rounded-2xl hover:bg-slate-50 disabled:opacity-50 transition-all flex items-center justify-center gap-3"
          >
            <i className="fas fa-copy"></i>
            Copy to Clipboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default Transcripts;
