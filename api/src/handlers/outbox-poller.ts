import { SQSClient, SendMessageBatchCommand, SendMessageBatchRequestEntry } from '@aws-sdk/client-sqs';
import { withTransaction } from '../db';

const sqs = new SQSClient({});
const QUEUE_URL = process.env.QUEUE_URL;

interface OutboxRow {
  id: string;
  topic: string;
  payload: any;
}

export const handler = async (event?: any): Promise<{ processed: number }> => {
  if (!QUEUE_URL) {
    throw new Error('QUEUE_URL environment variable is not defined');
  }

  return await withTransaction(async (client) => {
    // 1. Fetch unpublished outbox rows non-blockingly
    const res = await client.query<OutboxRow>(
      `SELECT id, topic, payload
         FROM outbox
        WHERE published_at IS NULL
        ORDER BY id ASC
        LIMIT 100
        FOR UPDATE SKIP LOCKED`
    );

    const rows = res.rows;
    if (rows.length === 0) {
      return { processed: 0 };
    }

    console.log(`[outbox-poller] Found ${rows.length} unpublished outbox rows`);

    // 2. Batch messages to SQS (max 10 items per batch)
    const BATCH_SIZE = 10;
    const publishedIds: string[] = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);
      const entries: SendMessageBatchRequestEntry[] = chunk.map((r, idx) => ({
        Id: `msg_${idx}_${r.id}`,
        MessageBody: JSON.stringify({
          outboxId: r.id,
          topic: r.topic,
          payload: r.payload,
        }),
        MessageAttributes: {
          topic: {
            DataType: 'String',
            StringValue: r.topic,
          },
        },
      }));

      const sendRes = await sqs.send(
        new SendMessageBatchCommand({
          QueueUrl: QUEUE_URL,
          Entries: entries,
        })
      );

      // Collect IDs of successfully sent messages
      if (sendRes.Successful) {
        for (const succ of sendRes.Successful) {
          const matchedEntry = entries.find((e) => e.Id === succ.Id);
          if (matchedEntry) {
            const body = JSON.parse(matchedEntry.MessageBody!);
            publishedIds.push(body.outboxId);
          }
        }
      }

      if (sendRes.Failed && sendRes.Failed.length > 0) {
        console.error('[outbox-poller] SQS SendMessageBatch failed for some entries:', sendRes.Failed);
      }
    }

    // 3. Mark successfully sent rows as published
    if (publishedIds.length > 0) {
      await client.query(
        `UPDATE outbox
            SET published_at = now()
          WHERE id = ANY($1::bigint[])`,
        [publishedIds]
      );
      console.log(`[outbox-poller] Marked ${publishedIds.length} outbox rows as published`);
    }

    return { processed: publishedIds.length };
  });
};
