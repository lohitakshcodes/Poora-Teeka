import fs from 'node:fs';
import path from 'node:path';
import {
  PollyClient,
  SynthesizeSpeechCommand,
  DescribeVoicesCommand,
  type Voice,
} from '@aws-sdk/client-polly';


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

const REGION = process.env.AWS_REGION || 'ap-south-1';
const pollyClient = new PollyClient({ region: REGION });

/**
 * Checks whether Polly has any Marathi (mr-IN) voice options available.
 */
export async function checkMarathiVoiceSupport(client: PollyClient = pollyClient): Promise<{
  hasMarathi: boolean;
  marathiVoices: Voice[];
  indicVoices: Voice[];
}> {
  console.log(`\n🔍 Checking Amazon Polly voices in region '${REGION}'...`);

  // Describe all available voices
  const command = new DescribeVoicesCommand({});
  const response = await client.send(command);
  const voices = response.Voices || [];

  const marathiVoices = voices.filter(
    (v) =>
      v.LanguageCode?.toLowerCase().startsWith('mr') ||
      v.AdditionalLanguageCodes?.some((code) => code.toLowerCase().startsWith('mr'))
  );

  const indicVoices = voices.filter(
    (v) =>
      v.LanguageCode?.includes('-IN') ||
      v.AdditionalLanguageCodes?.some((code) => code.includes('-IN'))
  );

  console.log(`--------------------------------------------------`);
  console.log(`Marathi (mr-IN) Voice Support Check:`);
  if (marathiVoices.length > 0) {
    console.log(`  ✅ YES, Polly currently has Marathi voice option(s):`);
    marathiVoices.forEach((v) => {
      console.log(`     - Name: ${v.Name}, ID: ${v.Id}, Engines: ${v.SupportedEngines?.join(', ')}`);
    });
  } else {
    console.log(`  ❌ NO, Polly does NOT currently have a Marathi voice option.`);
    console.log(`     Hindi (hi-IN) is the only Indian regional language voice supported.`);
  }

  console.log(`\nAll Indian Language Voices in Polly (${REGION}):`);
  indicVoices.forEach((v) => {
    const additional = v.AdditionalLanguageCodes?.length ? ` (also: ${v.AdditionalLanguageCodes.join(', ')})` : '';
    console.log(`  • ${v.Name} (${v.LanguageCode}${additional}) - Gender: ${v.Gender}, Engines: [${v.SupportedEngines?.join(', ')}]`);
  });
  console.log(`--------------------------------------------------`);

  return {
    hasMarathi: marathiVoices.length > 0,
    marathiVoices,
    indicVoices,
  };
}

/**
 * Synthesizes Hindi text into an MP3 file using Polly's neural engine.
 */
export async function synthesizeHindiSpeech(options: {
  text?: string;
  outputPath?: string;
  client?: PollyClient;
} = {}): Promise<string> {
  const client = options.client || pollyClient;
  const text =
    options.text ||
    'नमस्ते! यह पूरा टीका क्लिनिक से रेबीज टीकाकरण अनुस्मारक है। कृपया अपनी निर्धारित खुराक के लिए समय पर क्लिनिक आएं।';

  // Output destination: api/spikes/audio/hindi-reminder.mp3
  const defaultOutputPath = path.resolve(__dirname, 'audio', 'hindi-reminder.mp3');
  const outputPath = options.outputPath || defaultOutputPath;

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log(`\n🎙️ Synthesizing Hindi speech with Polly...`);
  console.log(`Voice: Kajal (Neural, hi-IN)`);
  console.log(`Text: "${text}"`);

  const command = new SynthesizeSpeechCommand({
    Engine: 'neural',
    VoiceId: 'Kajal',
    LanguageCode: 'hi-IN',
    OutputFormat: 'mp3',
    Text: text,
  });

  const response = await client.send(command);

  if (!response.AudioStream) {
    throw new Error('Polly response did not contain an AudioStream.');
  }

  let audioBuffer: Buffer;
  if ('transformToByteArray' in response.AudioStream && typeof (response.AudioStream as any).transformToByteArray === 'function') {
    const byteArray = await (response.AudioStream as any).transformToByteArray();
    audioBuffer = Buffer.from(byteArray);
  } else if (typeof (response.AudioStream as any)[Symbol.asyncIterator] === 'function') {
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.AudioStream as any) {
      chunks.push(chunk);
    }
    audioBuffer = Buffer.concat(chunks);
  } else {
    audioBuffer = Buffer.from(await (response.AudioStream as any));
  }

  fs.writeFileSync(outputPath, audioBuffer);

  const stats = fs.statSync(outputPath);
  console.log(`\n✅ Audio synthesized and saved successfully!`);
  console.log(`File: ${outputPath}`);
  console.log(`Size: ${(stats.size / 1024).toFixed(2)} KB`);

  return outputPath;
}

// Main spike runner
export async function runSpike(): Promise<void> {
  console.log(`========================================`);
  console.log(`  Poora Teeka - Amazon Polly Spike      `);
  console.log(`========================================`);

  // 1. Check Marathi voice support
  const { hasMarathi } = await checkMarathiVoiceSupport();

  // 2. Synthesize Hindi speech
  const customText = process.argv[2];
  const audioFilePath = await synthesizeHindiSpeech({
    text: customText,
  });

  console.log(`\n🎧 Playback test command:`);
  console.log(`   ffplay -nodisp -autoexit "${audioFilePath}"`);
  console.log(`   (or open with any media player)`);

  if (!hasMarathi) {
    console.log(`\n💡 Note: Marathi is not currently supported in Polly. Use Hindi ('Kajal' - neural) for Indic voice reminders.`);
  }
}

if (process.argv[1] && (process.argv[1].endsWith('polly-test.ts') || process.argv[1].endsWith('polly-test.js'))) {
  runSpike()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ Polly spike execution failed:', err);
      process.exit(1);
    });
}
