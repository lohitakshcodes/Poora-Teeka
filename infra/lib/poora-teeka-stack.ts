import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

export class PooraTeekaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Infrastructure resources will be defined here (RDS PostgreSQL, Lambdas, API Gateway, SQS, EventBridge)
  }
}
