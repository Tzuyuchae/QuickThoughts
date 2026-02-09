'use client';

import { useState, useRef } from 'react';

interface TranscriptionResult {
  transcription: string;
  label: string;
  category: string;
  summary?: string;
}

export default function VoiceMemoRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Use audio/webm for better compatibility
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      setError('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process audio');
      }

      const data = await response.json();
      setResult(data);
    } catch (error: any) {
      console.error('Error processing audio:', error);
      setError(error.message || 'Failed to process audio');
    } finally {
      setIsProcessing(false);
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      Work: 'bg-blue-100 text-blue-800',
      Personal: 'bg-green-100 text-green-800',
      Idea: 'bg-purple-100 text-purple-800',
      Reminder: 'bg-yellow-100 text-yellow-800',
      Meeting: 'bg-red-100 text-red-800',
      Note: 'bg-gray-100 text-gray-800',
      Other: 'bg-slate-100 text-slate-800',
    };
    return colors[category] || colors.Other;
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Voice Memo Transcriber</h1>
      
      <div className="mb-6">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          className={`px-8 py-4 rounded-lg font-semibold text-white transition-colors ${
            isRecording 
              ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
              : 'bg-blue-500 hover:bg-blue-600'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isRecording ? '⏹️ Stop Recording' : '🎤 Start Recording'}
        </button>
        
        {isProcessing && (
          <div className="mt-4 flex items-center gap-2 text-gray-600">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
            <p>Processing your voice memo...</p>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-purple-500 p-4 text-white">
            <h3 className="text-xl font-bold">{result.label}</h3>
            <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-semibold ${getCategoryColor(result.category)}`}>
              {result.category}
            </span>
          </div>
          
          <div className="p-6">
            {result.summary && (
              <div className="mb-4 pb-4 border-b border-gray-200">
                <p className="text-sm font-semibold text-gray-500 mb-1">Summary</p>
                <p className="text-gray-700 italic">{result.summary}</p>
              </div>
            )}
            
            <div>
              <p className="text-sm font-semibold text-gray-500 mb-2">Full Transcription</p>
              <p className="text-gray-800 leading-relaxed">{result.transcription}</p>
            </div>
          </div>
        </div>
      )}

      {!result && !isRecording && !isProcessing && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">Click the microphone to start recording a voice memo</p>
        </div>
      )}
    </div>
  );
}