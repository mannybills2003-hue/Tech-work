import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Square, 
  Volume2, 
  Mic2, 
  Sparkles, 
  Settings2, 
  History,
  Trash2,
  Download,
  Loader2,
  ChevronRight,
  User
} from 'lucide-react';
import { ttsService, VoiceName } from './services/ttsService';

interface VoiceOption {
  id: VoiceName;
  name: string;
  description: string;
  gender: 'Male' | 'Female' | 'Neutral';
  color: string;
}

const VOICES: VoiceOption[] = [
  { id: 'Kore', name: 'Kore', description: 'Warm and professional', gender: 'Female', color: 'from-rose-400 to-pink-600' },
  { id: 'Puck', name: 'Puck', description: 'Energetic and bright', gender: 'Male', color: 'from-amber-400 to-orange-600' },
  { id: 'Charon', name: 'Charon', description: 'Deep and authoritative', gender: 'Male', color: 'from-indigo-400 to-blue-600' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Mysterious and calm', gender: 'Male', color: 'from-emerald-400 to-teal-600' },
  { id: 'Zephyr', name: 'Zephyr', description: 'Soft and airy', gender: 'Neutral', color: 'from-violet-400 to-purple-600' },
];

/**
 * Converts raw PCM data to a playable WAV Blob URL.
 * Gemini TTS returns raw PCM (16-bit, mono, 24kHz).
 */
const pcmToWavUrl = (base64Pcm: string): string => {
  const binaryString = window.atob(base64Pcm);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF identifier
  view.setUint32(0, 0x52494646, false); // "RIFF"
  // file length
  view.setUint32(4, 36 + len, true);
  // RIFF type
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // format chunk identifier
  view.setUint32(12, 0x666d7420, false); // "fmt "
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (1 = PCM)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  // bits per sample
  view.setUint16(34, bitsPerSample, true);
  // data chunk identifier
  view.setUint32(36, 0x64617461, false); // "data"
  // data chunk length
  view.setUint32(40, len, true);

  const blob = new Blob([header, bytes], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};

const EMOTIONS = [
  { id: 'neutral', label: 'Neutral', prompt: '', category: 'Basic' },
  { id: 'cheerful', label: 'Cheerful', prompt: 'cheerful', category: 'Positive' },
  { id: 'excited', label: 'Excited', prompt: 'excited', category: 'Positive' },
  { id: 'warm', label: 'Warm', prompt: 'warm', category: 'Positive' },
  { id: 'ecstatic', label: 'Ecstatic', prompt: 'ecstatic', category: 'Positive' },
  { id: 'sad', label: 'Sad', prompt: 'sad', category: 'Negative' },
  { id: 'melancholic', label: 'Melancholic', prompt: 'melancholic', category: 'Negative' },
  { id: 'angry', label: 'Angry', prompt: 'angry', category: 'Negative' },
  { id: 'furious', label: 'Furious', prompt: 'furious', category: 'Negative' },
  { id: 'anxious', label: 'Anxious', prompt: 'anxious', category: 'Negative' },
  { id: 'serious', label: 'Serious', prompt: 'serious', category: 'Special' },
  { id: 'sarcastic', label: 'Sarcastic', prompt: 'sarcastic', category: 'Special' },
  { id: 'surprised', label: 'Surprised', prompt: 'surprised', category: 'Special' },
  { id: 'tired', label: 'Tired', prompt: 'tired', category: 'Special' },
  { id: 'whispering', label: 'Whispering', prompt: 'whispering', category: 'Special' },
];

interface HistoryItem {
  id: string;
  text: string;
  voice: VoiceName;
  emotion: string;
  audioUrl: string;
  timestamp: number;
}

export default function App() {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>('Kore');
  const [selectedEmotion, setSelectedEmotion] = useState('neutral');
  const [emotionIntensity, setEmotionIntensity] = useState(0.5);
  const [customEmotion, setCustomEmotion] = useState('');
  const [pronunciationGuides, setPronunciationGuides] = useState<{ word: string; phonetic: string }[]>([]);
  const [pitch, setPitch] = useState(1.0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isSSML, setIsSSML] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Update playback rate of current audio if it changes
    if (currentAudio) {
      currentAudio.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, currentAudio]);

  useEffect(() => {
    // Cleanup audio on unmount
    return () => {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = '';
      }
    };
  }, [currentAudio]);

  const handleGenerate = async () => {
    if (!text.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      let emotionPrompt = "";
      
      if (!isSSML) {
        if (customEmotion.trim()) {
          emotionPrompt = customEmotion.trim();
        } else {
          const emotion = EMOTIONS.find(e => e.id === selectedEmotion);
          if (emotion && emotion.id !== 'neutral') {
            const intensityPrefix = 
              emotionIntensity < 0.3 ? "slightly " : 
              emotionIntensity > 0.7 ? "extremely " : "";
            
            // Handle cases like "whispering" vs "cheerful"
            if (emotion.id === 'whispering') {
              emotionPrompt = intensityPrefix ? `${intensityPrefix} whispering` : "whispering";
            } else {
              emotionPrompt = `${intensityPrefix}${emotion.prompt}ly`;
            }
          }
        }
      }

      let finalPrompt = text;
      if (!isSSML && pronunciationGuides.length > 0) {
        const guides = pronunciationGuides
          .filter(g => g.word.trim() && g.phonetic.trim())
          .map(g => `"${g.word}" should be pronounced as "${g.phonetic}"`)
          .join(", ");
        if (guides) {
          finalPrompt = `Pronunciation guide: ${guides}. Text: ${text}`;
        }
      }

      const base64Audio = await ttsService.generateSpeech({
        text: finalPrompt,
        voice: selectedVoice,
        emotion: emotionPrompt,
        pitch,
        isSSML,
      });

      const audioUrl = pcmToWavUrl(base64Audio);
      
      const newItem: HistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        text,
        voice: selectedVoice,
        emotion: selectedEmotion,
        audioUrl,
        timestamp: Date.now(),
      };

      setHistory(prev => [newItem, ...prev]);
      playAudio(audioUrl);
    } catch (err) {
      console.error(err);
      setError('Failed to generate speech. Please check your API key and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const playAudio = (url: string) => {
    if (currentAudio) {
      currentAudio.pause();
    }

    const audio = new Audio(url);
    audio.playbackRate = playbackSpeed;
    audio.onplay = () => setIsPlaying(true);
    audio.onended = () => setIsPlaying(false);
    audio.onpause = () => setIsPlaying(false);
    
    setCurrentAudio(audio);
    setActiveAudioUrl(url);
    audio.play();
  };

  const stopAudio = () => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
  };

  const downloadAudio = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deleteHistoryItem = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-rose-500/30 overflow-x-hidden">
      {/* Dynamic Atmospheric Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Animated Blobs */}
        <motion.div 
          animate={{ 
            x: [0, 100, 0],
            y: [0, -50, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] bg-rose-900/15 blur-[120px] rounded-full" 
        />
        <motion.div 
          animate={{ 
            x: [0, -80, 0],
            y: [0, 100, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute top-[20%] -right-[10%] w-[50%] h-[70%] bg-blue-900/10 blur-[120px] rounded-full" 
        />
        <motion.div 
          animate={{ 
            x: [0, 50, 0],
            y: [0, -100, 0],
            scale: [1, 1.3, 1],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-[10%] left-[10%] w-[70%] h-[50%] bg-emerald-900/10 blur-[120px] rounded-full" 
        />
        
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        
        {/* Noise Overlay */}
        <div className="absolute inset-0 bg-noise opacity-[0.03] mix-blend-overlay" />
      </div>

      <main className="relative max-w-6xl mx-auto px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Left Column: Input & Controls */}
        <div className="lg:col-span-7 space-y-10">
          <header className="space-y-2">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-rose-500 font-mono text-sm tracking-widest uppercase"
            >
              <Sparkles className="w-4 h-4" />
              <span>Next-Gen Expression</span>
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl lg:text-7xl font-bold tracking-tighter"
            >
              Persona<span className="text-rose-500">Voice</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-zinc-400 text-lg max-w-md"
            >
              Bring your text to life with realistic character voices and emotional depth.
            </motion.p>
          </header>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="relative group"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-rose-500/20 to-violet-500/20 rounded-3xl blur opacity-25 group-focus-within:opacity-50 transition duration-500" />
            <div className="relative bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setIsSSML(!isSSML)}
                    className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                      isSSML 
                        ? 'bg-rose-500 text-white' 
                        : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {isSSML ? 'SSML Mode Active' : 'Enable SSML'}
                  </button>
                  {isSSML && (
                    <button 
                      onClick={() => setText('<speak>\n  Hello! <break time="1s"/> \n  I can speak with <emphasis level="strong">emphasis</emphasis> \n  and <prosody pitch="+20%" rate="slow">custom pitch and rate</prosody>.\n</speak>')}
                      className="text-[10px] text-zinc-500 hover:text-rose-400 font-bold uppercase tracking-widest"
                    >
                      Load Example
                    </button>
                  )}
                </div>
                {isSSML && (
                  <div className="text-[10px] text-rose-500/70 font-mono animate-pulse">
                    Advanced Markup Enabled
                  </div>
                )}
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={isSSML ? "<speak>Your SSML here...</speak>" : "Type something expressive..."}
                className="w-full h-48 bg-transparent border-none focus:ring-0 text-xl resize-none placeholder:text-zinc-700 font-mono"
              />
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800/50">
                <div className="flex gap-2">
                  <button className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500 hover:text-zinc-300">
                    <Mic2 className="w-5 h-5" />
                  </button>
                  <button className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500 hover:text-zinc-300">
                    <Settings2 className="w-5 h-5" />
                  </button>
                </div>
                <div className="text-xs font-mono text-zinc-600">
                  {text.length} characters
                </div>
              </div>
            </div>
          </motion.div>

          <div className={`space-y-6 transition-opacity duration-300 ${isSSML ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                <User className="w-4 h-4" /> Select Character
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {VOICES.map((voice) => (
                <button
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={`relative p-4 rounded-2xl border transition-all duration-300 text-left group overflow-hidden ${
                    selectedVoice === voice.id 
                      ? 'border-rose-500/50 bg-rose-500/5' 
                      : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                  }`}
                >
                  {selectedVoice === voice.id && (
                    <motion.div 
                      layoutId="voice-bg"
                      className={`absolute inset-0 bg-gradient-to-br ${voice.color} opacity-10`}
                    />
                  )}
                  <div className="relative z-10">
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${voice.color} mb-3 shadow-lg shadow-black/20`} />
                    <div className="font-bold text-sm">{voice.name}</div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-tight">{voice.gender}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className={`space-y-6 transition-opacity duration-300 ${isSSML ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Emotional Nuance
            </h3>
            
            <div className="space-y-4">
              {['Basic', 'Positive', 'Negative', 'Special'].map(category => (
                <div key={category} className="space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold px-1">{category}</div>
                  <div className="flex flex-wrap gap-2">
                    {EMOTIONS.filter(e => e.category === category).map((emotion) => (
                      <button
                        key={emotion.id}
                        onClick={() => {
                          setSelectedEmotion(emotion.id);
                          setCustomEmotion('');
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          selectedEmotion === emotion.id && !customEmotion
                            ? 'bg-zinc-100 text-zinc-900 shadow-lg shadow-white/10'
                            : 'bg-zinc-900/50 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        {emotion.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {selectedEmotion !== 'neutral' && !customEmotion && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="pt-2 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Intensity</label>
                  <span className="text-xs font-mono text-rose-500">
                    {emotionIntensity < 0.3 ? 'Subtle' : emotionIntensity > 0.7 ? 'Extreme' : 'Moderate'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={emotionIntensity}
                  onChange={(e) => setEmotionIntensity(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
                />
              </motion.div>
            )}
            
            <div className="relative group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Settings2 className="w-4 h-4 text-zinc-600" />
              </div>
              <input
                type="text"
                value={customEmotion}
                onChange={(e) => setCustomEmotion(e.target.value)}
                placeholder="Or describe a custom style (e.g., 'like a tired detective')"
                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-1 focus:ring-rose-500/50 focus:border-rose-500/50 transition-all placeholder:text-zinc-700"
              />
            </div>
          </div>

          <div className={`space-y-6 transition-opacity duration-300 ${isSSML ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                <Volume2 className="w-4 h-4" /> Voice Pitch
              </h3>
              <span className="text-xs font-mono text-rose-500">{pitch.toFixed(2)}x</span>
            </div>
            <div className="relative flex items-center gap-4">
              <span className="text-[10px] text-zinc-600 uppercase font-bold">Deep</span>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={pitch}
                onChange={(e) => setPitch(parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
              <span className="text-[10px] text-zinc-600 uppercase font-bold">High</span>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                <Play className="w-4 h-4" /> Playback Speed
              </h3>
              <span className="text-xs font-mono text-rose-500">{playbackSpeed.toFixed(2)}x</span>
            </div>
            <div className="relative flex items-center gap-4">
              <span className="text-[10px] text-zinc-600 uppercase font-bold">Slow</span>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
              <span className="text-[10px] text-zinc-600 uppercase font-bold">Fast</span>
            </div>
          </div>

          <div className={`space-y-6 transition-opacity duration-300 ${isSSML ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                <Mic2 className="w-4 h-4" /> Pronunciation Guide
              </h3>
              <button 
                onClick={() => setPronunciationGuides([...pronunciationGuides, { word: '', phonetic: '' }])}
                className="text-[10px] text-rose-500 hover:text-rose-400 font-bold uppercase tracking-widest"
              >
                + Add Guide
              </button>
            </div>
            <div className="space-y-3">
              {pronunciationGuides.map((guide, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Word"
                    value={guide.word}
                    onChange={(e) => {
                      const newGuides = [...pronunciationGuides];
                      newGuides[index].word = e.target.value;
                      setPronunciationGuides(newGuides);
                    }}
                    className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-xl py-2 px-3 text-xs focus:ring-1 focus:ring-rose-500/50 transition-all"
                  />
                  <input
                    type="text"
                    placeholder="Phonetic (e.g. 'eye-pee-ay')"
                    value={guide.phonetic}
                    onChange={(e) => {
                      const newGuides = [...pronunciationGuides];
                      newGuides[index].phonetic = e.target.value;
                      setPronunciationGuides(newGuides);
                    }}
                    className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-xl py-2 px-3 text-xs focus:ring-1 focus:ring-rose-500/50 transition-all"
                  />
                  <button 
                    onClick={() => setPronunciationGuides(pronunciationGuides.filter((_, i) => i !== index))}
                    className="p-2 text-zinc-600 hover:text-rose-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {pronunciationGuides.length === 0 && (
                <p className="text-[10px] text-zinc-600 italic">No custom pronunciations defined.</p>
              )}
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={handleGenerate}
              disabled={isLoading || !text.trim()}
              className="w-full py-5 bg-rose-600 hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3 shadow-xl shadow-rose-900/20 active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Play className="w-6 h-6 fill-current" />
                  <span>Generate Speech</span>
                </>
              )}
            </button>
            {error && (
              <p className="mt-4 text-rose-400 text-sm text-center bg-rose-950/20 py-2 rounded-lg border border-rose-900/30">
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Right Column: History & Player */}
        <div className="lg:col-span-5 space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <History className="w-5 h-5 text-rose-500" /> Recent Creations
            </h2>
            <button 
              onClick={() => setHistory([])}
              className="text-xs text-zinc-500 hover:text-rose-400 transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Clear All
            </button>
          </div>

          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {history.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-20 text-zinc-600 border-2 border-dashed border-zinc-900 rounded-3xl"
                >
                  <Volume2 className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-sm">Your generated clips will appear here</p>
                </motion.div>
              ) : (
                history.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="group bg-zinc-900/30 border border-zinc-800/50 hover:border-rose-500/30 rounded-2xl p-4 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full bg-gradient-to-br ${VOICES.find(v => v.id === item.voice)?.color}`} />
                        <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                          {item.voice} • {item.emotion}
                        </span>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => downloadAudio(item.audioUrl, `persona-voice-${item.id}`)}
                          className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-100"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => deleteHistoryItem(item.id)}
                          className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-300 line-clamp-2 mb-4 italic">"{item.text}"</p>
                    <button
                      onClick={() => playAudio(item.audioUrl)}
                      className="w-full py-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                    >
                      <Play className="w-3 h-3 fill-current" /> Play Clip
                    </button>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>

          {/* Active Player Overlay */}
          <AnimatePresence>
            {isPlaying && (
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
              >
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-2xl shadow-black flex items-center gap-4 backdrop-blur-2xl">
                  <div className="w-10 h-10 rounded-full bg-rose-600 flex items-center justify-center animate-pulse">
                    <Volume2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono text-rose-500 uppercase tracking-widest mb-1">Now Playing</div>
                    <div className="text-sm font-medium truncate text-zinc-100">Character Synthesis Active</div>
                  </div>
                  <div className="flex gap-2">
                    {activeAudioUrl && (
                      <button 
                        onClick={() => downloadAudio(activeAudioUrl, `persona-voice-${Date.now()}`)}
                        className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors text-zinc-400 hover:text-zinc-100"
                        title="Download Clip"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    )}
                    <button 
                      onClick={stopAudio}
                      className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
                      title="Stop"
                    >
                      <Square className="w-5 h-5 fill-current" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3f3f46;
        }
      `}</style>
    </div>
  );
}
