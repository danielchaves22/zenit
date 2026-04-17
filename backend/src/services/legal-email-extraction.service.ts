import OpenAiIntegrationService from './openai-integration.service';

export type LegalExtractionResult = {
  advogado: string | null;
  reclamante: string | null;
};

function parseJsonSafe(raw: string | null): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default class LegalEmailExtractionService {
  static async extract(companyId: number, emailBody: string): Promise<LegalExtractionResult> {
    const credential = await OpenAiIntegrationService.getDecryptedCredential(companyId, true);

    const prompt = `
Extraia as seguintes informacoes do email juridico:

1. Nome do advogado solicitante (quem assina o email, geralmente com OAB)
2. Nome do reclamante (geralmente em MAIUSCULAS, antes de datas)

Retorne apenas JSON valido:
{
  "advogado": "nome encontrado ou null",
  "reclamante": "NOME ENCONTRADO ou null"
}

Se nao encontrar alguma informacao, use null.

EMAIL:
${emailBody.substring(0, 6000)}
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: credential.model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Extrator de dados juridicos. Sempre retorne JSON valido. Se nao encontrar, retorne null.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 180,
        response_format: { type: 'json_object' }
      })
    });

    const raw = await response.text();
    const parsed = parseJsonSafe(raw);

    if (!response.ok) {
      throw new Error(`Falha OpenAI (${response.status}): ${raw}`);
    }

    const content = parsed?.choices?.[0]?.message?.content || null;
    const data = parseJsonSafe(content);

    return {
      advogado: data?.advogado ? String(data.advogado).trim() : null,
      reclamante: data?.reclamante ? String(data.reclamante).trim() : null
    };
  }
}

