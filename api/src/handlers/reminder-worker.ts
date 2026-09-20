import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { query } from '../db';

const polly = new PollyClient({});
const s3 = new S3Client({});
const cloudwatch = new CloudWatchClient({});
const secretsManager = new SecretsManagerClient({});

const AUDIO_BUCKET_NAME = process.env.AUDIO_BUCKET_NAME;
const WHATSAPP_SECRET_NAME = process.env.WHATSAPP_SECRET_NAME || 'poora-teeka/whatsapp';
const CLOUDWATCH_NAMESPACE = process.env.CLOUDWATCH_NAMESPACE || 'PooraTeeka';

interface ReminderJoinedData {
  reminder_id: string;
  reminder_kind: string;
  scheduled_for: string;
  reminder_status: string;
  idempotency_key: string;
  provider_msg_id: string | null;
  dose_id: string;
  dose_seq: number;
  due_date: string;
  route: string;
  course_id: string;
  patient_id: string;
  patient_name: string;
  phone_e164: string;
  patient_language: string;
  status_token: string | null;
  centre_id: string;
  centre_name: string;
  centre_city: string;
}

interface WhatsAppCredentials {
  token: string;
  phoneNumberId: string;
  recipientPhone?: string;
  templateName?: string;
  templateLang?: string;
}

let cachedCredentials: WhatsAppCredentials | null = null;

async function getWhatsAppCredentials(): Promise<WhatsAppCredentials> {
  if (cachedCredentials && cachedCredentials.token) {
    return cachedCredentials;
  }

  // 1. Try environment variables
  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    cachedCredentials = {
      token: process.env.WHATSAPP_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      recipientPhone: process.env.WHATSAPP_RECIPIENT_PHONE_NUMBER,
      templateName: process.env.WHATSAPP_TEMPLATE_NAME || 'hello_world',
      templateLang: process.env.WHATSAPP_TEMPLATE_LANG || 'en_US',
    };
    return cachedCredentials;
  }

  // 2. Fetch from AWS Secrets Manager
  try {
    const secRes = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: WHATSAPP_SECRET_NAME })
    );
    if (secRes.SecretString) {
      const parsed = JSON.parse(secRes.SecretString);
      cachedCredentials = {
        token: parsed.token,
        phoneNumberId: parsed.phoneNumberId,
        recipientPhone: parsed.recipientPhone,
        templateName: parsed.templateName || 'hello_world',
        templateLang: parsed.templateLang || 'en_US',
      };
      return cachedCredentials;
    }
  } catch (err: any) {
    console.warn('[reminder-worker] Could not fetch from Secrets Manager:', err.message);
  }

  throw new Error('WhatsApp credentials not available from Secrets Manager or environment');
}

/**
 * Builds deterministic localized message text from fixed templates (no LLM text generation).
 */
function buildReminderText(data: ReminderJoinedData): {
  spokenText: string;
  fullMessageText: string;
  voiceId: string;
  languageCode: string;
} {
  const { patient_name, dose_seq, due_date, centre_name, patient_language, reminder_kind } = data;

  const isMissed = reminder_kind === 'MISSED';

  const englishText = isMissed
    ? `URGENT: Hello ${patient_name}, you have missed your scheduled anti-rabies vaccination dose #${dose_seq} due on ${due_date} at ${centre_name}. Rabies post-exposure prophylaxis requires complete and timely doses. Please visit the clinic immediately.`
    : `Hello ${patient_name}, this is an anti-rabies vaccination reminder from ${centre_name}. Your dose #${dose_seq} is scheduled for ${due_date}. Please visit the clinic on time to complete your course.`;

  const hindiText = isMissed
    ? `अति आवश्यक: नमस्ते ${patient_name}, आप ${centre_name} में ${due_date} को देय रेबीज का टीका खुराक #${dose_seq} लगवाना भूल गए हैं। रेबीज से बचाव के लिए सभी खुराकें समय पर लेना अनिवार्य है। कृपया तुरंत क्लिनिक पहुंचकर टीका लगवाएं।`
    : `नमस्ते ${patient_name}, यह ${centre_name} से रेबीज टीकाकरण अनुस्मारक है। आपकी खुराक नंबर ${dose_seq} की तारीख ${due_date} है। कृपया समय पर क्लिनिक पहुंचकर टीका लगवाएं।`;

  const marathiText = isMissed
    ? `अति महत्त्वाचे: नमस्कार ${patient_name}, आपण ${centre_name} येथे ${due_date} रोजी देय असलेला रेबीज लसीचा डोस क्रमांक ${dose_seq} चुकवला आहे. रेबीजपासून संरक्षणासाठी पूर्ण लस घेणे अनिवार्य आहे. कृपया त्वरित क्लिनिकमध्ये जाऊन लस घ्यावी.`
    : `नमस्कार ${patient_name}, हे ${centre_name} कडून रेबीज लसीकरण स्मरणपत्र आहे. आपला डोस क्रमांक ${dose_seq} दिनांक ${due_date} रोजी देय आहे. कृपया वेळेवर क्लिनिकमध्ये उपस्थित रहावे.`;

  if (patient_language === 'mr') {
    return {
      spokenText: hindiText, // Polly lacks native Marathi; Hindi neural voice is used
      fullMessageText: `*English:*\n${englishText}\n\n*मराठी:*\n${marathiText}`,
      voiceId: 'Kajal',
      languageCode: 'hi-IN',
    };
  }

  if (patient_language === 'en') {
    return {
      spokenText: englishText,
      fullMessageText: `*English:*\n${englishText}\n\n*हिन्दी:*\n${hindiText}`,
      voiceId: 'Aditi',
      languageCode: 'en-IN',
    };
  }

  // Default: Hindi ('hi') - bilingual English + Hindi for maximum accessibility
  return {
    spokenText: hindiText,
    fullMessageText: `*English:*\n${englishText}\n\n*हिन्दी:*\n${hindiText}`,
    voiceId: 'Kajal',
    languageCode: 'hi-IN',
  };
}

/**
 * Emits CloudWatch custom metric under PooraTeeka namespace.
 */
async function emitMetric(metricName: 'RemindersSent' | 'RemindersFailed', kind: string) {
  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: CLOUDWATCH_NAMESPACE,
        MetricData: [
          {
            MetricName: metricName,
            Value: 1,
            Unit: 'Count',
            Dimensions: [{ Name: 'Kind', Value: kind }],
            Timestamp: new Date(),
          },
        ],
      })
    );
  } catch (err: any) {
    console.error(`[reminder-worker] Failed to publish CloudWatch metric ${metricName}:`, err.message);
  }
}

export const handler = async (event: any): Promise<any> => {
  console.log('[reminder-worker] Invoked with event:', JSON.stringify(event, null, 2));

  const reminderId =
    event.reminderId ||
    event.reminder_id ||
    event.detail?.reminderId ||
    event.detail?.reminder_id;

  if (!reminderId) {
    throw new Error('Event missing reminderId');
  }

  // 1. Load reminder + dose + course + patient + centre in one query
  const res = await query<ReminderJoinedData>(
    `SELECT
       r.id AS reminder_id,
       r.kind AS reminder_kind,
       r.scheduled_for,
       r.status AS reminder_status,
       r.idempotency_key,
       r.provider_msg_id,
       d.id AS dose_id,
       d.seq AS dose_seq,
       to_char(d.due_date, 'YYYY-MM-DD') AS due_date,
       d.route,
       c.id AS course_id,
       p.id AS patient_id,
       p.name AS patient_name,
       p.phone_e164,
       p.language AS patient_language,
       p.status_token,
       ctr.id AS centre_id,
       ctr.name AS centre_name,
       ctr.city AS centre_city
     FROM reminders r
     JOIN doses d ON d.id = r.dose_id
     JOIN courses c ON c.id = d.course_id
     JOIN patients p ON p.id = c.patient_id
     JOIN centres ctr ON ctr.id = c.centre_id
    WHERE r.id = $1`,
    [reminderId]
  );

  if (res.rows.length === 0) {
    throw new Error(`Reminder not found for id: ${reminderId}`);
  }

  const row = res.rows[0];

  // 2. Idempotency check: if status is already 'SENT', exit immediately
  if (row.reminder_status === 'SENT') {
    console.log(`[reminder-worker] Reminder ${reminderId} is already SENT. Exiting immediately.`);
    return {
      ok: true,
      skipped: true,
      reason: 'ALREADY_SENT',
      reminderId,
      providerMsgId: row.provider_msg_id,
    };
  }

  try {
    // 3. Build the message from fixed template (no LLM generation)
    const { spokenText, fullMessageText, voiceId, languageCode } = buildReminderText(row);

    // 4. Synthesize that text with Polly (neural voice)
    console.log(`[reminder-worker] Synthesizing speech with Polly (Voice: ${voiceId}, Lang: ${languageCode})...`);
    const pollyRes = await polly.send(
      new SynthesizeSpeechCommand({
        Engine: 'neural',
        VoiceId: voiceId as any,
        LanguageCode: languageCode as any,
        OutputFormat: 'mp3',
        Text: spokenText,
      })
    );

    if (!pollyRes.AudioStream) {
      throw new Error('Polly response did not contain an AudioStream');
    }

    let audioBuffer: Buffer;
    if (
      'transformToByteArray' in pollyRes.AudioStream &&
      typeof (pollyRes.AudioStream as any).transformToByteArray === 'function'
    ) {
      const byteArray = await (pollyRes.AudioStream as any).transformToByteArray();
      audioBuffer = Buffer.from(byteArray);
    } else if (typeof (pollyRes.AudioStream as any)[Symbol.asyncIterator] === 'function') {
      const chunks: Uint8Array[] = [];
      for await (const chunk of pollyRes.AudioStream as any) {
        chunks.push(chunk);
      }
      audioBuffer = Buffer.concat(chunks);
    } else {
      audioBuffer = Buffer.from(await (pollyRes.AudioStream as any));
    }

    // Upload MP3 to S3 at reminders/{doseId}.mp3
    if (!AUDIO_BUCKET_NAME) {
      throw new Error('AUDIO_BUCKET_NAME environment variable is not defined');
    }

    const s3Key =
      row.reminder_kind === 'MISSED'
        ? `reminders/${row.dose_id}-missed.mp3`
        : `reminders/${row.dose_id}.mp3`;
    console.log(`[reminder-worker] Uploading MP3 to S3: s3://${AUDIO_BUCKET_NAME}/${s3Key}...`);

    await s3.send(
      new PutObjectCommand({
        Bucket: AUDIO_BUCKET_NAME,
        Key: s3Key,
        Body: audioBuffer,
        ContentType: 'audio/mpeg',
      })
    );

    // Generate Presigned URL (1 hour validity for STS compatibility)
    const presignedAudioUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: AUDIO_BUCKET_NAME,
        Key: s3Key,
      }),
      { expiresIn: 3600 }
    );
    console.log(`[reminder-worker] Generated presigned audio URL: ${presignedAudioUrl}`);

    // 5. Send via WhatsApp Cloud API
    const credentials = await getWhatsAppCredentials();
    const token = credentials.token;
    const phoneNumberId = credentials.phoneNumberId;

    // Determine destination number (use recipientPhone if test sandbox number allow-listed)
    const rawDestination = credentials.recipientPhone || row.phone_e164;
    const recipient = rawDestination.replace(/\D/g, '');
    const templateName = credentials.templateName || 'hello_world';
    const templateLang = credentials.templateLang || 'en_US';

    console.log(`[reminder-worker] Sending WhatsApp template message to ${recipient} (Template: ${templateName})...`);

    const apiUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

    // Step A: Send Template Message
    let templateBody: any;
    if (templateName === 'hello_world') {
      templateBody = {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang },
        },
      };
    } else {
      templateBody = {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: row.patient_name },
                { type: 'text', text: String(row.dose_seq) },
              ],
            },
          ],
        },
      };
    }

    const tplRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(templateBody),
    });

    const tplData = (await tplRes.json()) as any;
    if (!tplRes.ok) {
      throw new Error(
        `WhatsApp template send failed (${tplRes.status}): ${tplData.error?.message || tplRes.statusText}`
      );
    }

    const providerMsgId = tplData.messages?.[0]?.id || `wa_${Date.now()}`;
    console.log(`[reminder-worker] WhatsApp template sent successfully! Provider Msg ID: ${providerMsgId}`);

    // Step B: Follow-up message with the audio link & localized appointment details
    try {
      // 1. Send text message with direct playback link and localized text
      const reminderTitle =
        row.reminder_kind === 'MISSED'
          ? `⚠️ *पूरा टीका (Poora Teeka) - URGENT: Missed Dose Notice / छूटा हुआ टीका*`
          : `💉 *पूरा टीका (Poora Teeka) - Vaccination Reminder*`;

      const textRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'text',
          text: {
            preview_url: false,
            body: `${reminderTitle}\n\n${fullMessageText}\n\n🎙️ _Please listen to the attached voice note below / कृपया नीचे दिया गया ऑडियो संदेश सुनें_`,
          },
        }),
      });
      const textData = await textRes.json();
      console.log(`[reminder-worker] Text follow-up HTTP ${textRes.status}:`, JSON.stringify(textData));

      // 2. Also send native audio message
      const audioRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'audio',
          audio: {
            link: presignedAudioUrl,
          },
        }),
      });
      const audioData = await audioRes.json();
      console.log(`[reminder-worker] Audio follow-up HTTP ${audioRes.status}:`, JSON.stringify(audioData));

      // 3. Send separate follow-up message with the live patient status portal link
      if (row.status_token) {
        const portalBaseUrl = process.env.APP_URL || 'https://main.d26dxmzrzyc9st.amplifyapp.com';
        const portalUrl = `${portalBaseUrl.replace(/\/$/, '')}/s/${row.status_token}`;
        const portalRes = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipient,
            type: 'text',
            text: {
              preview_url: true,
              body: `🔗 *View your live digital vaccination card & clinic directions:*\n${portalUrl}\n\n*अपना डिजिटल टीका कार्ड और क्लिनिक का रास्ता देखें:*\n${portalUrl}`,
            },
          }),
        });
        const portalData = await portalRes.json();
        console.log(`[reminder-worker] Portal link follow-up HTTP ${portalRes.status}:`, JSON.stringify(portalData));
      }
    } catch (followUpErr: any) {
      console.warn('[reminder-worker] Follow-up audio/text message error:', followUpErr.message);
    }

    // 6. On success: update reminder row to status 'SENT' with provider_msg_id
    await query(
      `UPDATE reminders
          SET status = 'SENT',
              provider_msg_id = $1,
              attempts = attempts + 1,
              last_error = NULL
        WHERE id = $2`,
      [providerMsgId, row.reminder_id]
    );

    // 7. Publish CloudWatch custom metric: RemindersSent
    await emitMetric('RemindersSent', row.reminder_kind);

    return {
      ok: true,
      reminderId: row.reminder_id,
      providerMsgId,
      presignedAudioUrl,
    };
  } catch (err: any) {
    console.error(`[reminder-worker] Error processing reminder ${reminderId}:`, err);

    // On failure from Polly, S3, or WhatsApp: do NOT mark as sent!
    // Update attempts & last_error, publish RemindersFailed metric, and rethrow.
    await query(
      `UPDATE reminders
          SET attempts = attempts + 1,
              last_error = $1
        WHERE id = $2`,
      [err.message || 'Unknown error', row.reminder_id]
    ).catch(() => {});

    await emitMetric('RemindersFailed', row.reminder_kind);

    // Rethrow so the schedule invocation fails and retries/routes to DLQ
    throw err;
  }
};
