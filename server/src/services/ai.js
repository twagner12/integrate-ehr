import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import fs from 'fs';

const openai = process.env.OPENAI_API_KEY ? new OpenAI() : null;
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

export async function transcribeAudio(filePath) {
  if (!openai) throw new Error('OpenAI not configured. Set OPENAI_API_KEY in .env');

  const file = fs.createReadStream(filePath);
  const response = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: 'en',
  });
  return response.text;
}

export async function generateSOAPNote(transcript, context = {}) {
  if (!anthropic) throw new Error('Anthropic not configured. Set ANTHROPIC_API_KEY in .env');

  const { clientName, serviceName, clinicianName, diagnosisInfo } = context;

  const prompt = `You are a speech-language pathologist writing a clinical SOAP note for a therapy session. Based on the following session transcript, generate a structured SOAP note with four sections.

${clientName ? `Client: ${clientName}` : ''}
${serviceName ? `Service: ${serviceName}` : ''}
${clinicianName ? `Clinician: ${clinicianName}` : ''}
${diagnosisInfo ? `Diagnosis: ${diagnosisInfo}` : ''}

Session transcript:
${transcript}

Write the SOAP note in the following JSON format. Each section should be 2-5 sentences of professional clinical documentation. Use clinical terminology appropriate for speech-language pathology. Do not include section headers in the text itself.

{
  "subjective": "...",
  "objective": "...",
  "assessment": "...",
  "plan": "..."
}

Return ONLY the JSON object, no other text.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].text.trim();
  // Parse JSON from the response (handle potential markdown code blocks)
  const jsonStr = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(jsonStr);
}
