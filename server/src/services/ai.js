import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import fs from 'fs';

const PROMPT_VERSION = '2.0';

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

// ── Two-Pass SOAP Agent ─────────────────────────────────────────────────────
// Pass 1: Clinical Extraction — filters a raw transcript down to only
//         clinically relevant observations for SOAP documentation
// Pass 2: SOAP Writer — generates professional clinical documentation
//         from the extracted observations + client context

const EXTRACTION_SYSTEM = `You are a clinical data extraction agent for a speech-language pathology practice. Your job is to read raw session transcripts — which include casual conversation, behavioral management, transitions, praise, off-topic talk, and actual therapy — and extract ONLY the clinically relevant information needed for SOAP documentation.

You are processing recordings of 50-minute therapy sessions with children. Expect a lot of noise. Most of the transcript is NOT relevant.

Extract observations into four categories:

**SUBJECTIVE** — Look for:
- Anything the child or parent reported (complaints, how they're feeling, what happened since last session)
- Child's self-assessment of their performance
- Parent comments at drop-off or pick-up about progress or concerns
- Child's mood or emotional state as expressed by them

**OBJECTIVE** — Look for (this is the most important section):
- Specific therapy tasks/activities performed and which speech/language targets were addressed
- Accuracy data: count correct vs incorrect responses, percentage if mentioned
- Level of cueing needed (independent, minimal cues, moderate cues, maximal cues, hand-over-hand)
- Specific phonemes, words, or language structures targeted
- Stimuli or materials used
- Behavioral observations (attention, cooperation, frustration, engagement)
- Any standardized or informal assessment data
- Specific examples of correct/incorrect productions

**ASSESSMENT** — Look for:
- Clinician's verbal comments about progress (e.g. "you're doing so much better with that sound")
- Comparison to previous performance
- Whether goals were met, partially met, or not met
- Clinical impressions about the child's status

**PLAN** — Look for:
- What the clinician said they'd work on next time
- Homework or home practice instructions given to child or parent
- Any changes to treatment approach mentioned
- Frequency/scheduling comments
- Referral mentions

Output a JSON object with the four categories. Each should be an array of specific, concise observations. If a category has no relevant data, use an empty array. Include approximate timestamps or position context where helpful.

{
  "subjective": ["observation 1", "observation 2"],
  "objective": ["observation 1", "observation 2"],
  "assessment": ["observation 1"],
  "plan": ["observation 1"]
}

Return ONLY the JSON object.`;

const SOAP_WRITER_SYSTEM = `You are an experienced speech-language pathologist (SLP) writing clinical SOAP notes. You write concise, professional documentation that would be appropriate for insurance records and clinical files.

Your writing style:
- Use third person ("Client demonstrated..." not "I observed...")
- Use clinical SLP terminology (phonological processes, articulation targets, language formulation, etc.)
- Be specific with data (percentages, cue levels, number of trials)
- Keep each section 2-5 sentences
- Do not include section headers (S/O/A/P) in the text
- For children, refer to them as "client" or "patient"

For the Objective section specifically:
- Always include what activities/tasks were performed
- Always include accuracy data or performance levels when available
- Always note the cueing level required
- Structure as: targets addressed → activities used → performance data → behavioral observations

For the Assessment section:
- Compare to previous session performance when prior notes are available
- State progress toward treatment goals
- Give clinical impression of current functioning level

For the Plan section:
- State what will be targeted next session
- Note any homework assigned
- Mention any recommended changes to treatment`;

export async function generateSOAPNote(transcript, context = {}) {
  if (!anthropic) throw new Error('Anthropic not configured. Set ANTHROPIC_API_KEY in .env');

  const { clientName, serviceName, clinicianName, diagnoses, previousNote, examples, clinicianStyle } = context;

  // ── Pass 1: Extract clinical observations from raw transcript ──────────
  const extractionMessage = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: EXTRACTION_SYSTEM,
    messages: [{
      role: 'user',
      content: `Extract clinically relevant observations from this ${serviceName || 'therapy'} session transcript.

${clientName ? `Client: ${clientName}` : ''}
${diagnoses ? `Diagnoses: ${diagnoses}` : ''}

Transcript:
${transcript}`
    }],
  });

  let extracted;
  try {
    const extractText = extractionMessage.content[0].text.trim();
    const extractJson = extractText.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    extracted = JSON.parse(extractJson);
  } catch {
    // If extraction parsing fails, fall back to using raw transcript
    extracted = null;
  }

  // ── Pass 2: Generate SOAP note from extracted observations ─────────────
  let clinicalData;
  if (extracted) {
    clinicalData = Object.entries(extracted)
      .map(([section, observations]) => {
        const obs = Array.isArray(observations) ? observations : [];
        return obs.length > 0
          ? `${section.toUpperCase()}:\n${obs.map(o => `- ${o}`).join('\n')}`
          : null;
      })
      .filter(Boolean)
      .join('\n\n');
  }

  const contextLines = [
    clientName && `Client: ${clientName}`,
    serviceName && `Service: ${serviceName}`,
    clinicianName && `Clinician: ${clinicianName}`,
    diagnoses && `Diagnoses: ${diagnoses}`,
  ].filter(Boolean).join('\n');

  let previousNoteSection = '';
  if (previousNote) {
    previousNoteSection = `\n\nPrevious session note (for continuity and comparison):
S: ${previousNote.subjective || 'N/A'}
O: ${previousNote.objective || 'N/A'}
A: ${previousNote.assessment || 'N/A'}
P: ${previousNote.plan || 'N/A'}`;
  }

  // Build few-shot examples section
  let examplesSection = '';
  if (examples && examples.length > 0) {
    const exampleEntries = examples.map((ex, i) =>
      `Example ${i + 1}:\nS: ${ex.subjective}\nO: ${ex.objective}\nA: ${ex.assessment}\nP: ${ex.plan}`
    ).join('\n\n');
    examplesSection = `\n\nHere are examples of well-written SOAP notes from this practice:\n\n${exampleEntries}\n\nMatch this style, tone, and level of detail.`;
  }

  const writerPrompt = clinicalData
    ? `Write a SOAP note from these extracted clinical observations.

${contextLines}${previousNoteSection}${examplesSection}

Extracted observations:
${clinicalData}

Write the SOAP note as a JSON object:
{ "subjective": "...", "objective": "...", "assessment": "...", "plan": "..." }

Return ONLY the JSON object.`
    : `Write a SOAP note from this session transcript.

${contextLines}${previousNoteSection}${examplesSection}

Session transcript:
${transcript}

Write the SOAP note as a JSON object:
{ "subjective": "...", "objective": "...", "assessment": "...", "plan": "..." }

Return ONLY the JSON object.`;

  // Build system prompt with optional clinician style
  let systemPrompt = SOAP_WRITER_SYSTEM;
  if (clinicianStyle) {
    systemPrompt += `\n\nAdditional style instructions for this clinician:\n${clinicianStyle}`;
  }

  const soapMessage = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: writerPrompt }],
  });

  const text = soapMessage.content[0].text.trim();
  const jsonStr = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  const parsed = JSON.parse(jsonStr);
  return { ...parsed, _promptVersion: PROMPT_VERSION };
}
