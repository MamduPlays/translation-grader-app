import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Upload, Sun, Moon, AlertTriangle, RefreshCw, CheckCircle2, Play, Square, LogOut, History, Loader2, Volume2 } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { supabase } from './services/supabase';
import { Session } from '@supabase/supabase-js';
import Auth from './components/Auth';
import TranslationHistory from './components/TranslationHistory';

type ResultType = {
  urduTranscription: string;
  englishTranscription: string;
  score: number;
  mistakes: string[];
  betterTranslation: string;
  feedback: string;
};

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<'user' | 'admin' | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);
  const [view, setView] = useState<'home' | 'history'>('home');
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ResultType | null>(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserRole(session.user.id);
      } else {
        setIsRoleLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserRole(session.user.id);
      } else {
        setUserRole(null);
        setView('home');
        setIsRoleLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string) => {
    setIsRoleLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();
        
      if (!error && data) {
        setUserRole(data.role);
        if (data.role === 'admin') {
          setView('history'); // Admins only see history
        } else {
          setView('home');
        }
      }
    } catch (err) {
      console.error('Error fetching user role:', err);
    } finally {
      setIsRoleLoading(false);
    }
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await analyzeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Could not access microphone. Please ensure permissions are granted.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setError(null);
      await analyzeAudio(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        // Remove the data URL prefix (e.g., "data:audio/webm;base64,")
        const base64Data = base64String.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const analyzeAudio = async (audioBlob: Blob) => {
    setIsAnalyzing(true);
    setResult(null);
    setError(null);

    try {
      const mimeType = audioBlob.type || 'audio/webm';
      const base64Audio = await blobToBase64(audioBlob);

      // Upload audio to Supabase Storage
      let audioUrl = null;
      if (session?.user?.id) {
        const fileName = `${session.user.id}/${Date.now()}.webm`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('recordings')
          .upload(fileName, audioBlob);
          
        if (uploadError) {
          console.error('Error uploading audio:', uploadError);
        } else if (uploadData) {
          const { data } = supabase.storage
            .from('recordings')
            .getPublicUrl(fileName);
          audioUrl = data.publicUrl;
        }
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const prompt = "Listen to the provided audio. The speaker will say a sentence in Urdu, followed by their English translation. 1. Transcribe the Urdu part. 2. Transcribe the English part. 3. Rate the accuracy and naturalness of the English translation on a scale of 1 to 10. 4. List any grammar or vocabulary mistakes. 5. Provide a better, more natural English translation. 6. Give brief overall feedback. Return strictly in JSON format.";

      const config = {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            urduTranscription: { type: Type.STRING },
            englishTranscription: { type: Type.STRING },
            score: { type: Type.NUMBER },
            mistakes: { type: Type.ARRAY, items: { type: Type.STRING } },
            betterTranslation: { type: Type.STRING },
            feedback: { type: Type.STRING }
          },
          required: ["urduTranscription", "englishTranscription", "score", "mistakes", "betterTranslation", "feedback"]
        }
      };

      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: [
            {
              parts: [
                { inlineData: { data: base64Audio, mimeType } },
                { text: prompt }
              ]
            }
          ],
          config
        });
      } catch (err: any) {
        console.warn('Primary model failed, falling back to flash model:', err);
        // Fallback to flash if pro fails (e.g., 429 Quota)
        response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              parts: [
                { inlineData: { data: base64Audio, mimeType } },
                { text: prompt }
              ]
            }
          ],
          config
        });
      }

      if (response && response.text) {
        const jsonResult = JSON.parse(response.text) as ResultType;
        setResult(jsonResult);
        setCurrentAudioUrl(audioUrl);

        // Save to Supabase
        if (session?.user?.id) {
          const { error: dbError } = await supabase
            .from('translations')
            .insert([
              {
                user_id: session.user.id,
                urdu_transcription: jsonResult.urduTranscription,
                english_transcription: jsonResult.englishTranscription,
                score: jsonResult.score,
                mistakes: jsonResult.mistakes,
                better_translation: jsonResult.betterTranslation,
                feedback: jsonResult.feedback,
                audio_url: audioUrl
              }
            ]);
            
          if (dbError) {
            console.error('Error saving to Supabase:', dbError);
          }
        }
      } else {
        throw new Error("No response text received from AI.");
      }

    } catch (err: any) {
      console.error('Error analyzing audio:', err);
      setError(err.message || 'An error occurred while analyzing the audio. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const reset = () => {
    setResult(null);
    setCurrentAudioUrl(null);
    setError(null);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'dark bg-[#0B1120] text-slate-50' : 'bg-slate-50 text-slate-900'}`}>
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        
        {/* Header */}
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Olevels.com <span className="text-red-600 dark:text-red-500">Translation Grader</span>
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm md:text-base">
              Master your translations
            </p>
          </div>
          <div className="flex items-center gap-3">
            {session && (
              <>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:block mr-2">
                  Hi, {session.user.user_metadata?.full_name || 'User'} {userRole === 'admin' && '(Admin)'}
                </span>
                {userRole !== 'admin' && (
                  <button
                    onClick={() => setView(view === 'home' ? 'history' : 'home')}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium shadow-sm"
                    aria-label="History"
                  >
                    <History className="w-4 h-4" />
                    <span className="hidden sm:inline">{view === 'home' ? 'History' : 'Grader'}</span>
                  </button>
                )}
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium shadow-sm"
                  aria-label="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </>
            )}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-3 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
              aria-label="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-slate-700" />}
            </button>
          </div>
        </header>

        <main>
          {!session ? (
            <Auth isDarkMode={isDarkMode} />
          ) : isRoleLoading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-red-500 mb-4" />
              <p className="text-slate-500 dark:text-slate-400">Loading your account...</p>
            </div>
          ) : view === 'history' || userRole === 'admin' ? (
            <TranslationHistory session={session} onBack={() => setView('home')} isAdmin={userRole === 'admin'} />
          ) : (
            <AnimatePresence mode="wait">
              {!result && !isAnalyzing && (
                <motion.div
                  key="input-section"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-8"
                >
                  {/* Instruction Box */}
                  <div className="bg-white dark:bg-slate-900/50 p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800/60 backdrop-blur-sm">
                    <div className="flex items-start gap-4">
                      <div className="bg-red-100 dark:bg-red-500/10 p-3 rounded-2xl text-red-600 dark:text-red-400">
                        <Play className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">Instructions</h2>
                        <p className="text-slate-600 dark:text-slate-300">
                          Speak a sentence in Urdu, then immediately translate it to English.
                        </p>
                        <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-100 dark:border-slate-800/60">
                          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Example:</p>
                          <p className="italic text-slate-700 dark:text-slate-200">
                            "Mera naam Ali hai. My name is Ali."
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Input Buttons */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <button
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`relative flex flex-col items-center justify-center p-12 rounded-3xl border-2 transition-all duration-300 overflow-hidden ${
                        isRecording
                          ? 'border-red-500 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 shadow-[0_0_30px_rgba(239,68,68,0.2)]'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-red-300 dark:hover:border-red-500/50 hover:shadow-lg dark:hover:bg-slate-800/50'
                      }`}
                    >
                      {isRecording && (
                        <span className="absolute inset-0 rounded-3xl animate-ping border-2 border-red-400 dark:border-red-500 opacity-20"></span>
                      )}
                      <div className={`p-4 rounded-full mb-4 transition-colors ${isRecording ? 'bg-red-100 dark:bg-red-500/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                        {isRecording ? <Square className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                      </div>
                      <span className="text-xl font-semibold">
                        {isRecording ? 'Stop Recording' : 'Record Voice'}
                      </span>
                      {isRecording && (
                        <span className="mt-2 text-sm font-medium animate-pulse">Recording...</span>
                      )}
                    </button>

                    <div className="relative">
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={handleFileUpload}
                        ref={fileInputRef}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className="flex flex-col items-center justify-center p-12 rounded-3xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-lg dark:hover:bg-slate-800/50 transition-all duration-300 h-full">
                        <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                          <Upload className="w-8 h-8 text-slate-600 dark:text-slate-400" />
                        </div>
                        <span className="text-xl font-semibold">Upload File</span>
                        <span className="mt-2 text-sm text-slate-500 dark:text-slate-400">MP3, WAV, M4A</span>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl text-red-600 dark:text-red-400 flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 shrink-0" />
                      <p>{error}</p>
                    </div>
                  )}
                </motion.div>
              )}

              {isAnalyzing && (
                <motion.div
                  key="analyzing-section"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center justify-center py-24"
                >
                  <div className="relative w-24 h-24 mb-8">
                    <div className="absolute inset-0 border-4 border-slate-200 dark:border-slate-800 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-red-600 dark:border-red-500 rounded-full border-t-transparent animate-spin shadow-[0_0_15px_rgba(239,68,68,0.5)]"></div>
                  </div>
                  <h2 className="text-2xl font-bold mb-2 text-slate-900 dark:text-white">Analyzing Audio</h2>
                  <p className="text-slate-500 dark:text-slate-400 text-center max-w-md">
                    Our AI is transcribing your speech and evaluating your translation...
                  </p>
                </motion.div>
              )}

              {result && !isAnalyzing && (
                <motion.div
                  key="results-section"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  {/* Score Card */}
                  <div className="bg-white dark:bg-slate-900/80 p-8 rounded-3xl shadow-lg border border-slate-200 dark:border-slate-800/60 text-center relative overflow-hidden backdrop-blur-sm">
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 via-orange-500 to-red-500 bg-[length:200%_auto] animate-gradient"></div>
                    <h2 className="text-lg font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Translation Score</h2>
                    <div className="flex items-baseline justify-center gap-2">
                      <span className="text-7xl font-black text-slate-900 dark:text-white drop-shadow-sm">{result.score}</span>
                      <span className="text-2xl font-bold text-slate-400 dark:text-slate-500">/ 10</span>
                    </div>
                  </div>

                  {/* Transcriptions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-slate-900/50 p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800/60 backdrop-blur-sm">
                      <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Urdu Transcription</h3>
                      <p className="text-lg text-slate-800 dark:text-slate-200 font-medium leading-relaxed" dir="rtl">
                        {result.urduTranscription}
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-900/50 p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800/60 backdrop-blur-sm">
                      <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">English Transcription</h3>
                      <p className="text-lg text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                        {result.englishTranscription}
                      </p>
                    </div>
                  </div>

                  {currentAudioUrl && (
                    <div className="bg-white dark:bg-slate-900/50 p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800/60 backdrop-blur-sm flex flex-col sm:flex-row items-center gap-4">
                      <div className="bg-red-100 dark:bg-red-500/20 p-4 rounded-full text-red-600 dark:text-red-400">
                        <Volume2 className="w-6 h-6" />
                      </div>
                      <div className="flex-1 w-full">
                        <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Original Recording</h3>
                        <audio src={currentAudioUrl} controls className="w-full h-10 accent-red-500" />
                      </div>
                    </div>
                  )}

                  {/* Better Translation */}
                  <div className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-500/10 dark:to-orange-500/10 p-6 rounded-3xl border border-red-100 dark:border-red-500/20 shadow-inner">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                      <h3 className="text-sm font-semibold text-red-800 dark:text-red-300 uppercase tracking-wider">Better Translation</h3>
                    </div>
                    <p className="text-xl font-bold text-red-700 dark:text-red-400 drop-shadow-sm">
                      {result.betterTranslation}
                    </p>
                  </div>

                  {/* Mistakes & Feedback Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-slate-900/50 p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800/60 backdrop-blur-sm">
                      <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Mistakes Identified</h3>
                      {result.mistakes && result.mistakes.length > 0 ? (
                        <ul className="space-y-3">
                          {result.mistakes.map((mistake, index) => (
                            <li key={index} className="flex items-start gap-3">
                              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                              <span className="text-slate-700 dark:text-slate-300">{mistake}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-500/20">
                          <CheckCircle2 className="w-5 h-5" />
                          <span className="font-medium">No major mistakes found!</span>
                        </div>
                      )}
                    </div>

                    <div className="bg-white dark:bg-slate-900/50 p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800/60 backdrop-blur-sm">
                      <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Overall Feedback</h3>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {result.feedback}
                      </p>
                    </div>
                  </div>

                  {/* Try Another Button */}
                  <div className="pt-6">
                    <button
                      onClick={reset}
                      className="w-full flex items-center justify-center gap-2 py-5 px-8 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 rounded-2xl text-lg font-bold transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                    >
                      <RefreshCw className="w-5 h-5" />
                      Try Another Translation
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </main>
      </div>
    </div>
  );
}
