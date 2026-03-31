import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@/lib/supabase/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const DAILY_LIMIT = 10;

// ---------------------------------------------------------------------------
// Rate limit helpers
// ---------------------------------------------------------------------------

async function checkAndIncrementRateLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ limited: boolean; count: number }> {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  const { data: existing, error: fetchErr } = await supabase
    .from('gemini_usage')
    .select('call_count')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle();

  if (fetchErr) {
    // Fail open — don't block the user for a DB hiccup
    console.error('rate limit fetch error:', fetchErr);
    return { limited: false, count: 0 };
  }

  const currentCount = existing?.call_count ?? 0;

  if (currentCount >= DAILY_LIMIT) {
    return { limited: true, count: currentCount };
  }

  const { error: upsertErr } = await supabase.from('gemini_usage').upsert(
    {
      user_id: userId,
      usage_date: today,
      call_count: currentCount + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,usage_date' }
  );

  if (upsertErr) {
    console.error('rate limit upsert error:', upsertErr);
    return { limited: false, count: currentCount };
  }

  return { limited: false, count: currentCount + 1 };
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

    const supabase = await createClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit check — happens before any Gemini work
    const { limited, count } = await checkAndIncrementRateLimit(supabase, user.id);

    if (limited) {
      return NextResponse.json(
        {
          error: `Daily AI limit of ${DAILY_LIMIT} uses reached. Try again tomorrow.`,
          rateLimited: true,
          count,
          limit: DAILY_LIMIT,
        },
        { status: 429 }
      );
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

    // UPDATED: Using Gemini 3.1 Flash-Lite with JSON response mode
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3.1-flash-lite-preview',
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const nowLocal = new Date().toLocaleString('en-US', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const exampleTs = `2025-03-15T09:00:00${userOffsetString}`;

    const prompt = [
      'Transcribe the audio, then extract distinct thoughts (each an actionable idea, plan, task, or note).',
      '',
      `User local time: ${nowLocal}`,
      `User timezone: ${userTimezone} (UTC offset ${userOffsetString})`,
      '',
      'Respond with a valid JSON object. Do not include markdown code fences.',
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

    // UPDATED: Since we use responseMimeType, we parse the text directly
    const raw = result.response.text();
    const parsedData = JSON.parse(raw);

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
            reminder_at = t.reminder_at;
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