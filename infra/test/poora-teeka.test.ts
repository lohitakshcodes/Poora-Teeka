import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import * as PooraTeeka from '../lib/poora-teeka-stack';

test('PooraTeekaStack can be synthesized', () => {
  const app = new cdk.App();
  const stack = new PooraTeeka.PooraTeekaStack(app, 'PooraTeekaTestStack');
  const template = Template.fromStack(stack);
  expect(template).toBeDefined();
});
