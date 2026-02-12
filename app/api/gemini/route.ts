import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@/lib/supabase/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Fetch user's existing folders (AI must not create folders)
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
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

    // Always allow fallback to Unsorted (must already exist from onboarding)
    const allowedFolders = Array.from(new Set(['Unsorted', ...existingFolderNames]));

    // Convert audio file to base64
    const bytes = await audioFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Audio = buffer.toString('base64');

    // Determine mime type
    const mimeType = audioFile.type || 'audio/webm';

    // Use Gemini to transcribe and analyze
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // NOTE: This endpoint ONLY assigns thoughts to existing folders; it never creates folders.
    const prompt = `Transcribe the audio, then extract distinct thoughts (each thought should be one actionable idea, plan, task, or note).

Return ONLY valid JSON (no markdown) in this exact shape:
{
  "transcription": string,
  "thoughts": [
    { "text": string, "folder": string, "label": string }
  ]
}

Rules:
- Return between 1 and 10 thoughts.
- "label" should be 2-5 words.
- "folder" MUST be one of the allowed folder names listed below.
- If none fit, use "Unsorted".

Allowed folder names:
${JSON.stringify(allowedFolders)}
`;

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Audio,
          mimeType: mimeType,
        },
      },
      prompt,
    ]);

    const response = result.response.text();
    
    // Clean up response (remove markdown code blocks if present)
    const cleanedResponse = response
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsedData = JSON.parse(cleanedResponse);

    const transcription = String(parsedData?.transcription ?? '').trim();
    const rawThoughts = Array.isArray(parsedData?.thoughts) ? parsedData.thoughts : [];

    const thoughts = rawThoughts
      .map((t: any) => {
        const text = String(t?.text ?? '').trim();
        const label = String(t?.label ?? '').trim();
        const folder = String(t?.folder ?? 'Unsorted').trim();
        return {
          text,
          label,
          folder: allowedFolders.includes(folder) ? folder : 'Unsorted',
        };
      })
      .filter((t: any) => t.text.length > 0)
      .slice(0, 10);

    // Backwards-compatible fields for any existing UI that expects a single label/category
    const primaryLabel = thoughts[0]?.label || 'Voice Memo';
    const primaryCategory = thoughts[0]?.folder || 'Unsorted';

    return NextResponse.json({
      transcription,
      thoughts,
      label: primaryLabel,
      category: primaryCategory,
    });

  } catch (error: any) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: error.message || 'Transcription failed' },
      { status: 500 }
    );
  }
}