import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

interface IdempotencyRecord {
  key: string;
  endpoint: string;
  response: any;
  createdAt: Date;
}

/**
 * Pure simulation of the idempotency layer used across Poora Teeka handlers
 * (courses.ts, dose-given.ts, patients.ts)
 */
export class IdempotencyHandler {
  private store = new Map<string, IdempotencyRecord>();

  async execute<T>(
    headers: Record<string, string | undefined>,
    endpoint: string,
    action: () => Promise<{ statusCode: number; body: T }>
  ): Promise<{
    statusCode: number;
    headers: Record<string, string>;
    body: T;
    cached: boolean;
  }> {
    // Check both lowercase and PascalCase header keys
    const key = headers['idempotency-key'] || headers['Idempotency-Key'];

    if (key && this.store.has(key)) {
      const cached = this.store.get(key)!;
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Cache': 'IDEMPOTENT',
        },
        body: cached.response,
        cached: true,
      };
    }

    // Execute underlying operation
    const result = await action();

    if (key) {
      this.store.set(key, {
        key,
        endpoint,
        response: result.body,
        createdAt: new Date(),
      });
    }

    return {
      statusCode: result.statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
      body: result.body,
      cached: false,
    };
  }

  getRecordCount(): number {
    return this.store.size;
  }
}

describe('3. Idempotency Key Replay', () => {
  it('executes work on first request and caches the result', async () => {
    const handler = new IdempotencyHandler();
    let executions = 0;

    const res1 = await handler.execute(
      { 'Idempotency-Key': 'key-test-uuid-001' },
      'POST /courses',
      async () => {
        executions++;
        return {
          statusCode: 201,
          body: { courseId: 'c1', dosesCreated: 4 },
        };
      }
    );

    assert.equal(executions, 1, 'Action should have executed once');
    assert.equal(res1.cached, false);
    assert.equal(res1.statusCode, 201);
    assert.deepEqual(res1.body, { courseId: 'c1', dosesCreated: 4 });
  });

  it('returns stored result with X-Cache: IDEMPOTENT on replay without re-executing work', async () => {
    const handler = new IdempotencyHandler();
    let executions = 0;

    const action = async () => {
      executions++;
      return {
        statusCode: 200,
        body: { doseId: 'd1', unitsAllocated: 2, vialId: 'vial-1' },
      };
    };

    // First call
    const res1 = await handler.execute(
      { 'idempotency-key': 'req-idempotent-replay-100' },
      'POST /doses/given',
      action
    );
    assert.equal(executions, 1);
    assert.equal(res1.cached, false);

    // Second call (replay of same key)
    const res2 = await handler.execute(
      { 'idempotency-key': 'req-idempotent-replay-100' },
      'POST /doses/given',
      action
    );

    assert.equal(executions, 1, 'Action must NOT be executed a second time on replay');
    assert.equal(res2.cached, true, 'Result should be served from cache');
    assert.equal(res2.headers['X-Cache'], 'IDEMPOTENT');
    assert.deepEqual(res2.body, res1.body);
  });

  it('handles case-insensitive header names (idempotency-key vs Idempotency-Key)', async () => {
    const handler = new IdempotencyHandler();
    let executions = 0;

    const action = async () => {
      executions++;
      return { statusCode: 200, body: { success: true } };
    };

    // First call with lowercase header
    await handler.execute({ 'idempotency-key': 'case-test-key-55' }, 'POST /courses', action);
    assert.equal(executions, 1);

    // Replay with PascalCase header
    const res = await handler.execute(
      { 'Idempotency-Key': 'case-test-key-55' },
      'POST /courses',
      action
    );
    assert.equal(executions, 1, 'Must recognize existing key regardless of header casing');
    assert.equal(res.headers['X-Cache'], 'IDEMPOTENT');
  });
});
