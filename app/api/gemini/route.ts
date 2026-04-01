import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@/lib/supabase/server';

// Initialize Gemini with the 3.1 Flash-Lite Preview model
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const DAILY_LIMIT = 10;
const MIN_AUDIO_BYTES = 1500;

// ---------------------------------------------------------------------------
// Content guards
// ---------------------------------------------------------------------------

function isMeaningful(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3) return false;
  // Filter out common hallucination words if they appear alone
  const hallucinationBlacklist = ['thank you', 'thanks for watching', 'subtitle', 'bye'];
  if (hallucinationBlacklist.includes(trimmed.toLowerCase())) return false;

  const words = trimmed.split(/\s+/).filter((w) => w.length > 1);
  return words.length >= 1;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const userTimezone = (formData.get('timezone') as string | null) || 'UTC';
    const rawOffsetMins = parseInt(formData.get('timezoneOffset') as string ?? '0', 10);

    const userOffsetString = (() => {
      const totalMins = -rawOffsetMins;
      const sign = totalMins >= 0 ? '+' : '-';
      const abs = Math.abs(totalMins);
      const hours = String(Math.floor(abs / 60)).padStart(2, '0');
      const mins = String(abs % 60).padStart(2, '0');
      return `${sign}${hours}:${mins}`;
    })();

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    if (audioFile.size < MIN_AUDIO_BYTES) {
      return NextResponse.json(
        { error: 'Recording was too short or silent.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ---------------------------------------------------------------------------
    // Rate limit check — read current count before doing any work
    // ---------------------------------------------------------------------------
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

    const { data: existing, error: fetchErr } = await supabase
      .from('gemini_usage')
      .select('call_count')
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .maybeSingle();

    if (fetchErr) {
      console.error('rate limit fetch error:', fetchErr);
    }

    const currentCount = existing?.call_count ?? 0;

    if (currentCount >= DAILY_LIMIT) {
      return NextResponse.json(
        { error: `Daily limit of ${DAILY_LIMIT} reached.`, rateLimited: true, count: currentCount },
        { status: 429 }
      );
    }

    // Fetch folders for categorization
    const { data: folders } = await supabase.from('folders').select('name').eq('user_id', user.id);
    const allowedFolders = Array.from(new Set(['Unsorted', ...(folders?.map(f => f.name) || [])]));

    const bytes = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(bytes).toString('base64');
    const mimeType = audioFile.type || 'audio/webm';

    // ── CONFIGURATION: The Anti-Hallucination Setup ────────────────────────
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite-preview',
      systemInstruction: `You are a literal transcription engine. 
      STRICT AUDIT RULES:
      1. If the audio is silence, static, or background noise, return exactly: {"transcription": "", "thoughts": []}
      2. Do NOT greet the user. Do NOT explain your output. 
      3. Never "autocomplete" speech. If you hear "Buy...", do not output "Buy groceries" unless you hear "groceries".`,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.0, // Force absolute literalism
      },
    });

    const nowLocal = new Date().toLocaleString('en-US', {
      timeZone: userTimezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });

    const prompt = [
      `User local time: ${nowLocal}`,
      `User UTC offset: ${userOffsetString}`,
      '',
      '### TASK ###',
      'Transcribe and extract thoughts into JSON. ',
      'Return {"transcription": "", "thoughts": []} if NO CLEAR SPEECH IS DETECTED.',
      '',
      '### SCHEMA ###',
      '{ "transcription": "string", "thoughts": [{ "text": "string", "label": "string", "folder": "string", "reminder_at": "ISO8601 or null" }] }',
      '',
      `Allowed folders: ${JSON.stringify(allowedFolders)}`,
    ].join('\n');

    const result = await model.generateContent([{ inlineData: { data: base64Audio, mimeType } }, prompt]);
    const parsedData = JSON.parse(result.response.text());

    const transcription = String(parsedData?.transcription ?? '').trim();
    const rawThoughts = Array.isArray(parsedData?.thoughts) ? parsedData.thoughts : [];

    const thoughts = rawThoughts
      .map((t: any) => ({
        text: String(t?.text ?? '').trim(),
        label: String(t?.label ?? '').trim(),
        folder: allowedFolders.includes(t?.folder) ? t.folder : 'Unsorted',
        reminder_at: (t?.reminder_at && !isNaN(new Date(t.reminder_at).getTime())) ? t.reminder_at : null,
      }))
      .filter((t: any) => isMeaningful(t.text))
      .slice(0, 10);

    // ── FINAL HALLUCINATION GUARD ──────────────────────────────────────────
    // If transcription is long but audio is tiny (e.g. < 10KB), it's a hallucination.
    const isLikelyHallucination = transcription.length > 20 && audioFile.size < 4000;
    const hasUsableContent = !isLikelyHallucination && (thoughts.length > 0 || isMeaningful(transcription));

    if (!hasUsableContent) {
      // No real speech — do NOT increment the counter
      return NextResponse.json({ error: 'No speech detected.', noContent: true }, { status: 422 });
    }

    // ---------------------------------------------------------------------------
    // Atomically increment the counter only after confirmed good response.
    // The SQL function handles INSERT-or-UPDATE so there's no stale-read race.
    // ---------------------------------------------------------------------------
    const { error: rpcError } = await supabase
      .rpc('increment_gemini_usage', { p_user_id: user.id });

    if (rpcError) console.error('rate limit increment error:', rpcError);

    return NextResponse.json({
      transcription,
      thoughts,
      label: thoughts[0]?.label || 'Voice Memo',
      category: thoughts[0]?.folder || 'Unsorted'
    });

  } catch (error: any) {
    console.error('Transcription error:', error);
    return NextResponse.json({ error: 'Process failed' }, { status: 500 });
  }
}