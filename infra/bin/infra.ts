#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { PooraTeekaStack } from '../lib/poora-teeka-stack';

const app = new cdk.App();
new PooraTeekaStack(app, 'PooraTeekaStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-south-1',
  },
});
