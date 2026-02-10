import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

    // Convert audio file to base64
    const bytes = await audioFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Audio = buffer.toString('base64');

    // Determine mime type
    const mimeType = audioFile.type || 'audio/webm';

    // Use Gemini to transcribe and analyze
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Please transcribe this audio and then analyze it. Provide a response in JSON format with the following fields:
    - transcription: the full text transcription
    - label: a brief descriptive label (2-5 words) that captures the main topic
    - category: assign to ONE of these categories: Work, Personal, Idea, Reminder, Meeting, Note, Other
    
    Return only valid JSON, no markdown formatting.`;

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

    return NextResponse.json({
      transcription: parsedData.transcription,
      label: parsedData.label,
      category: parsedData.category,
    });

  } catch (error: any) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: error.message || 'Transcription failed' },
      { status: 500 }
    );
  }
}