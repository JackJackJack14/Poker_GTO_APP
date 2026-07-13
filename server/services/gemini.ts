import { GoogleGenAI, Type } from '@google/genai';
import type { GameState, GtoResponse } from '../types';
import { buildUserPrompt, GTO_SYSTEM_PROMPT } from '../prompts/gtoCoach';

const GTO_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    equity: {
      type: Type.NUMBER,
      description: 'Estimated hero equity as percentage 0-100',
    },
    advice: {
      type: Type.STRING,
      description: 'Short GTO advice in Thai',
    },
    explanation: {
      type: Type.STRING,
      description:
        'Strategic explanation in Thai covering EV, pot odds, MDF, and ranges',
    },
    suggestedActions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          action: {
            type: Type.STRING,
            enum: ['CHECK', 'FOLD', 'CALL', 'RAISE'],
          },
          size: {
            type: Type.NUMBER,
            description: 'Bet or raise size in BB',
          },
          frequency: {
            type: Type.NUMBER,
            description: 'GTO mix frequency 0-1',
          },
        },
        required: ['action'],
      },
    },
  },
  required: ['equity', 'advice', 'explanation', 'suggestedActions'],
};

let aiClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export async function analyzeGameState(
  gameState: GameState,
): Promise<GtoResponse> {
  const ai = getClient();
  const userPrompt = buildUserPrompt(gameState);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: userPrompt,
    config: {
      systemInstruction: GTO_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: GTO_RESPONSE_SCHEMA,
      temperature: 0.4,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Empty response from Gemini API');
  }

  const parsed = JSON.parse(text) as GtoResponse;

  if (
    typeof parsed.equity !== 'number' ||
    typeof parsed.advice !== 'string' ||
    typeof parsed.explanation !== 'string' ||
    !Array.isArray(parsed.suggestedActions)
  ) {
    throw new Error('Invalid GTO response structure from Gemini');
  }

  return parsed;
}
