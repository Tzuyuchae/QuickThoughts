import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@/lib/supabase/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    // Browser's IANA timezone and UTC offset — both sent from the client so we
    // never have to derive them server-side (server timezone != user timezone).
    const userTimezone = (formData.get('timezone') as string | null) || 'UTC';
    // timezoneOffset is JS getTimezoneOffset() — minutes BEHIND UTC, e.g. 360 for UTC-6
    // We convert it to an ISO offset string like "-06:00"
    const rawOffsetMins = parseInt(formData.get('timezoneOffset') as string ?? '0', 10);
    const userOffsetString = (() => {
      const totalMins = -rawOffsetMins; // flip sign: JS is inverted
      const sign = totalMins >= 0 ? '+' : '-';
      const abs = Math.abs(totalMins);
      const hours = String(Math.floor(abs / 60)).padStart(2, '0');
      const mins = String(abs % 60).padStart(2, '0');
      return `${sign}${hours}:${mins}`;
    })();

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: folders, error: foldersErr } = await supabase
      .from('folders')
      .select('name')
      .eq('user_id', user.id);

    if (foldersErr) {
      return NextResponse.json(
        { error: foldersErr.message || 'Failed to load folders' },
        { status: 500 }
      );
    }

    const existingFolderNames = (folders ?? [])
      .map((f: any) => String(f?.name ?? '').trim())
      .filter(Boolean);

    const allowedFolders = Array.from(new Set(['Unsorted', ...existingFolderNames]));

    const bytes = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(bytes).toString('base64');
    const mimeType = audioFile.type || 'audio/webm';

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Build a human-readable local time string for the user's timezone
    const nowLocal = new Date().toLocaleString('en-US', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    // userOffsetString is now derived from client-sent timezoneOffset above

    // Build prompt — keep the JSON schema as plain text descriptions, NOT as
    // a literal JSON block with unquoted values, which causes Gemini to echo
    // back invalid JSON with unquoted property values.
    const exampleTs = `2025-03-15T09:00:00${userOffsetString}`;

    const prompt = [
      'Transcribe the audio, then extract distinct thoughts (each an actionable idea, plan, task, or note).',
      '',
      `User local time: ${nowLocal}`,
      `User timezone: ${userTimezone} (UTC offset ${userOffsetString})`,
      '',
      'Respond with ONLY a valid JSON object. No markdown, no code fences, no trailing commas.',
      'The object must have exactly two keys:',
      '  "transcription" — string, the full transcript.',
      '  "thoughts" — array of objects, each with these four string keys:',
      '    "text"        — the thought content.',
      '    "label"       — 2 to 5 word summary.',
      '    "folder"      — must be one of the allowed folder names below; use "Unsorted" if none fit.',
      '    "reminder_at" — ISO 8601 timestamp string if the audio mentions a date/time for this thought, otherwise JSON null.',
      '',
      'reminder_at rules:',
      '  - Only set it when the audio clearly states a date, time, or relative reference (tomorrow, next Friday, in 2 hours, etc.).',
      '  - Resolve relative references using the user local time above.',
      '  - When a date is given without a time, default to 09:00 local — never use midnight.',
      `  - Include the UTC offset in the timestamp. Example: "${exampleTs}"`,
      '  - Use JSON null (not the string null) when there is no date or time.',
      '',
      `Allowed folder names: ${JSON.stringify(allowedFolders)}`,
    ].join('\n');

    const result = await model.generateContent([
      { inlineData: { data: base64Audio, mimeType } },
      prompt,
    ]);

    const raw = result.response.text();

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    const parsedData = JSON.parse(cleaned);

    const transcription = String(parsedData?.transcription ?? '').trim();
    const rawThoughts = Array.isArray(parsedData?.thoughts) ? parsedData.thoughts : [];

    const thoughts = rawThoughts
      .map((t: any) => {
        const text = String(t?.text ?? '').trim();
        const label = String(t?.label ?? '').trim();
        const folder = String(t?.folder ?? 'Unsorted').trim();

        let reminder_at: string | null = null;
        if (t?.reminder_at && typeof t.reminder_at === 'string') {
          const parsed = new Date(t.reminder_at);
          if (!isNaN(parsed.getTime())) {
            reminder_at = t.reminder_at; // keep offset-aware string, don't convert to UTC
          }
        }

        return {
          text,
          label,
          folder: allowedFolders.includes(folder) ? folder : 'Unsorted',
          reminder_at,
        };
      })
      .filter((t: any) => t.text.length > 0)
      .slice(0, 10);

    const primaryLabel = thoughts[0]?.label || 'Voice Memo';
    const primaryCategory = thoughts[0]?.folder || 'Unsorted';

    return NextResponse.json({ transcription, thoughts, label: primaryLabel, category: primaryCategory });

  } catch (error: any) {
    console.error('Transcription error:', error);
    return NextResponse.json({ error: error.message || 'Transcription failed' }, { status: 500 });
  }
}