import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib/core';
import { PooraTeekaStack } from '../lib/poora-teeka-stack';

// Load .env from root if available
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envPath);
}

const app = new cdk.App();
new PooraTeekaStack(app, 'PooraTeekaStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '615818266331',
    region: 'ap-south-1',
  },
});
