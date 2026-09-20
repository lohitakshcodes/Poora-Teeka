import fs from 'node:fs';
import path from 'node:path';

// Attempt to load .env file if running locally
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'api/.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../.env'),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    try {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(envPath);
        console.log(`Loaded environment from: ${envPath}`);
      }
      break;
    } catch (err) {
      console.warn(`Could not load ${envPath}:`, err);
    }
  }
}

interface WhatsAppResponse {
  messaging_product?: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export async function sendWhatsAppTemplateMessage(): Promise<WhatsAppResponse> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const rawRecipient = process.env.WHATSAPP_RECIPIENT_PHONE_NUMBER || process.env.RECIPIENT_PHONE_NUMBER;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'hello_world';
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US';

  const missingVars: string[] = [];
  if (!token) missingVars.push('WHATSAPP_TOKEN');
  if (!phoneNumberId) missingVars.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!rawRecipient) missingVars.push('WHATSAPP_RECIPIENT_PHONE_NUMBER (or RECIPIENT_PHONE_NUMBER)');

  if (missingVars.length > 0) {
    console.error(`\n❌ Error: Missing required environment variables:`);
    missingVars.forEach((v) => console.error(`  - ${v}`));
    console.error(`\nPlease ensure these are defined in your .env file or environment.`);
    throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
  }

  // Sanitize recipient phone number (remove +, spaces, hyphens)
  const recipient = (rawRecipient as string).replace(/\D/g, '');

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: templateLang,
      },
    },
  };

  console.log(`\n📤 Sending WhatsApp template message...`);
  console.log(`Target URL: https://graph.facebook.com/v21.0/${phoneNumberId}/messages`);
  console.log(`Recipient: ${recipient}`);
  console.log(`Template: ${templateName} (${templateLang})`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseData = (await response.json()) as WhatsAppResponse;

  if (!response.ok) {
    console.error(`\n❌ WhatsApp API call failed with HTTP status ${response.status}:`);
    console.error(JSON.stringify(responseData, null, 2));
    throw new Error(
      `WhatsApp API request failed (${response.status}): ${responseData.error?.message || response.statusText}`
    );
  }

  console.log(`\n✅ Message sent successfully! HTTP Status: ${response.status}`);
  console.log(`API Response:`);
  console.log(JSON.stringify(responseData, null, 2));

  return responseData;
}

// Execute immediately when run directly
if (process.argv[1] && (process.argv[1].endsWith('whatsapp-test.ts') || process.argv[1].endsWith('whatsapp-test.js'))) {
  sendWhatsAppTemplateMessage()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error(`\nFailed execution:`, err.message);
      process.exit(1);
    });
}
