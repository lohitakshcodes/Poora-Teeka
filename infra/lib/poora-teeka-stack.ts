import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export class PooraTeekaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const apiProjectRoot = path.join(__dirname, '../../api');
    const depsLockFilePath = path.join(__dirname, '../../api/package-lock.json');

    // Database environment variables passed to Lambdas
    const dbEnv: Record<string, string> = {
      DB_HOST: process.env.DB_HOST || 'poorateeka-db.cveomiu62p3d.ap-southeast-2.rds.amazonaws.com',
      DB_PORT: process.env.DB_PORT || '5432',
      DB_NAME: process.env.DB_NAME || 'postgres',
      DB_USER: process.env.DB_USER || 'poorateeka_admin',
      DB_PASSWORD: process.env.DB_PASSWORD || '',
      PGSSLMODE: process.env.PGSSLMODE || 'require',
    };

    const commonBundling = {
      minify: true,
      sourceMap: true,
      externalModules: ['@aws-sdk/*', 'pg-native'],
    };

    // 1. Hello Lambda (Default route fallback)
    const helloFn = new NodejsFunction(this, 'HelloHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../api/src/hello.ts'),
      projectRoot: apiProjectRoot,
      depsLockFilePath,
      handler: 'handler',
      bundling: commonBundling,
    });

    // 2. Patients Handler (POST /patients)
    const patientsFn = new NodejsFunction(this, 'PatientsHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../api/src/handlers/patients.ts'),
      projectRoot: apiProjectRoot,
      depsLockFilePath,
      handler: 'handler',
      environment: dbEnv,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      bundling: commonBundling,
    });

    // 3. Courses Handler (POST /courses)
    const coursesFn = new NodejsFunction(this, 'CoursesHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../api/src/handlers/courses.ts'),
      projectRoot: apiProjectRoot,
      depsLockFilePath,
      handler: 'handler',
      environment: dbEnv,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      bundling: commonBundling,
    });

    // 4. Doses Handler (GET /doses/today)
    const dosesFn = new NodejsFunction(this, 'DosesHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../api/src/handlers/doses.ts'),
      projectRoot: apiProjectRoot,
      depsLockFilePath,
      handler: 'handler',
      environment: dbEnv,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      bundling: commonBundling,
    });

    // 5. Vials Handler (POST /vials/open)
    const vialsFn = new NodejsFunction(this, 'VialsHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../api/src/handlers/vials.ts'),
      projectRoot: apiProjectRoot,
      depsLockFilePath,
      handler: 'handler',
      environment: dbEnv,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      bundling: commonBundling,
    });

    // 6. Dose Given Handler (POST /doses/{id}/given)
    const doseGivenFn = new NodejsFunction(this, 'DoseGivenHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../api/src/handlers/dose-given.ts'),
      projectRoot: apiProjectRoot,
      depsLockFilePath,
      handler: 'handler',
      environment: dbEnv,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      bundling: commonBundling,
    });

    // 7. SQS Queue + DLQ (3 retries)
    const dlq = new sqs.Queue(this, 'OutboxDLQ', {
      queueName: 'poora-teeka-outbox-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    const reminderQueue = new sqs.Queue(this, 'ReminderQueue', {
      queueName: 'poora-teeka-reminder-queue',
      visibilityTimeout: cdk.Duration.seconds(60),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: dlq,
      },
    });

    // 8. Outbox Poller Lambda (Runs every minute via EventBridge Rule)
    const outboxPollerFn = new NodejsFunction(this, 'OutboxPollerHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../api/src/handlers/outbox-poller.ts'),
      projectRoot: apiProjectRoot,
      depsLockFilePath,
      handler: 'handler',
      environment: {
        ...dbEnv,
        QUEUE_URL: reminderQueue.queueUrl,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      bundling: commonBundling,
    });
    reminderQueue.grantSendMessages(outboxPollerFn);

    const pollerRule = new events.Rule(this, 'OutboxPollerRule', {
      description: 'Trigger outbox poller every minute to publish events to SQS',
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
    });
    pollerRule.addTarget(new targets.LambdaFunction(outboxPollerFn));

    // Audio Bucket for synthesized voice reminders
    const audioBucket = new s3.Bucket(this, 'AudioBucket', {
      bucketName: `poora-teeka-audio-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(30),
        },
      ],
    });

    // WhatsApp Cloud API Credentials Secret
    const whatsappSecret = new secretsmanager.Secret(this, 'WhatsAppSecret', {
      secretName: 'poora-teeka/whatsapp',
      description: 'WhatsApp Cloud API credentials for Poora Teeka',
      secretObjectValue: {
        token: cdk.SecretValue.unsafePlainText(process.env.WHATSAPP_TOKEN || ''),
        phoneNumberId: cdk.SecretValue.unsafePlainText(process.env.WHATSAPP_PHONE_NUMBER_ID || '1258346617371697'),
        recipientPhone: cdk.SecretValue.unsafePlainText(process.env.WHATSAPP_RECIPIENT_PHONE_NUMBER || '917389592662'),
        templateName: cdk.SecretValue.unsafePlainText(process.env.WHATSAPP_TEMPLATE_NAME || 'hello_world'),
        templateLang: cdk.SecretValue.unsafePlainText(process.env.WHATSAPP_TEMPLATE_LANG || 'en_US'),
      },
    });

    // TypeSafe AI (Jev System One) API Key Secret
    const typesafeSecret = new secretsmanager.Secret(this, 'TypeSafeSecret', {
      secretName: 'poora-teeka/typesafe',
      description: 'TypeSafe AI API Key for Jev System One model',
      secretObjectValue: {
        apiKey: cdk.SecretValue.unsafePlainText(process.env.TYPESAFE_API_KEY || ''),
      },
    });

    // 9. Reminder Worker Lambda (Voice synthesis, S3 presigning, WhatsApp dispatch)
    const reminderWorkerFn = new NodejsFunction(this, 'ReminderWorkerHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../api/src/handlers/reminder-worker.ts'),
      projectRoot: apiProjectRoot,
      depsLockFilePath,
      handler: 'handler',
      environment: {
        ...dbEnv,
        AUDIO_BUCKET_NAME: audioBucket.bucketName,
        WHATSAPP_SECRET_NAME: whatsappSecret.secretName,
        CLOUDWATCH_NAMESPACE: 'PooraTeeka',
      },
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      bundling: commonBundling,
    });

    // Least-privilege permissions:
    // 1. Polly: synthesize speech
    reminderWorkerFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['polly:SynthesizeSpeech'],
        resources: ['*'],
      })
    );

    // 2. S3: PutObject & GetObject scoped strictly to reminders/* in this bucket
    audioBucket.grantPut(reminderWorkerFn, 'reminders/*');
    audioBucket.grantRead(reminderWorkerFn, 'reminders/*');

    // 3. Secrets Manager: GetSecretValue scoped strictly to the WhatsApp secret
    whatsappSecret.grantRead(reminderWorkerFn);

    // 4. CloudWatch: PutMetricData scoped to PooraTeeka namespace
    reminderWorkerFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'PooraTeeka',
          },
        },
      })
    );

    // 10. IAM Role for EventBridge Scheduler to invoke Reminder Worker
    const schedulerExecutionRole = new iam.Role(this, 'SchedulerExecutionRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'IAM role assumed by EventBridge Scheduler to trigger the reminder worker Lambda',
    });
    reminderWorkerFn.grantInvoke(schedulerExecutionRole);

    // 11. Schedule Creator Lambda (Triggered by SQS)
    const scheduleCreatorFn = new NodejsFunction(this, 'ScheduleCreatorHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../api/src/handlers/schedule-creator.ts'),
      projectRoot: apiProjectRoot,
      depsLockFilePath,
      handler: 'handler',
      environment: {
        ...dbEnv,
        WORKER_LAMBDA_ARN: reminderWorkerFn.functionArn,
        SCHEDULER_ROLE_ARN: schedulerExecutionRole.roleArn,
      },
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      bundling: commonBundling,
    });

    // Connect SQS to Schedule Creator
    scheduleCreatorFn.addEventSource(
      new lambdaEventSources.SqsEventSource(reminderQueue, {
        batchSize: 10,
      })
    );

    // IAM Permissions for Schedule Creator:
    // 1. Create and manage schedules in EventBridge Scheduler
    scheduleCreatorFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'scheduler:CreateSchedule',
          'scheduler:GetSchedule',
          'scheduler:UpdateSchedule',
          'scheduler:DeleteSchedule',
        ],
        resources: [
          `arn:aws:scheduler:${this.region}:${this.account}:schedule/default/*`,
          `arn:aws:scheduler:${this.region}:${this.account}:schedule/*`,
        ],
      })
    );

    // 2. PassRole to allow assigning SchedulerExecutionRole to created schedules
    scheduleCreatorFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [schedulerExecutionRole.roleArn],
      })
    );

    // 12. Missed Dose Sweep Lambda (Runs on schedule to mark overdue doses as MISSED)
    const missedDoseSweepFn = new NodejsFunction(this, 'MissedDoseSweepHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../api/src/handlers/missed-dose-sweep.ts'),
      projectRoot: apiProjectRoot,
      depsLockFilePath,
      handler: 'handler',
      environment: {
        ...dbEnv,
        MISSED_DOSE_GRACE_MINUTES: '0',
        MISSED_DOSE_GRACE_HOURS: '0',
        CLOUDWATCH_NAMESPACE: 'PooraTeeka',
        TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY || '',
        TYPESAFE_SECRET_NAME: typesafeSecret.secretName,
      },
      timeout: cdk.Duration.seconds(45),
      memorySize: 512,
      bundling: commonBundling,
    });

    // Grant read permission for TypeSafe secret
    typesafeSecret.grantRead(missedDoseSweepFn);

    // CloudWatch permissions for custom metrics
    missedDoseSweepFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'PooraTeeka',
          },
        },
      })
    );

    // EventBridge Rule running every 5 minutes
    // NOTE: In a real production deployment, this sweep would run once or twice daily
    // (e.g. at 20:00 IST after outpatient clinic hours close).
    // The 5-minute interval configured on EventBridge is for demo/testing purposes.
    const missedDoseSweepRule = new events.Rule(this, 'MissedDoseSweepRule', {
      description: 'Trigger missed dose sweep every 5 minutes (demo interval)',
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
    });
    missedDoseSweepRule.addTarget(new targets.LambdaFunction(missedDoseSweepFn));

    // API Gateway HTTP API
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'poora-teeka-http-api',
      description: 'Poora Teeka HTTP API Gateway',
      defaultIntegration: new HttpLambdaIntegration('HelloDefaultIntegration', helloFn),
    });

    // Explicit routes
    httpApi.addRoutes({
      path: '/patients',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('PatientsIntegration', patientsFn, {
        timeout: cdk.Duration.seconds(29),
      }),
    });

    httpApi.addRoutes({
      path: '/courses',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('CoursesIntegration', coursesFn, {
        timeout: cdk.Duration.seconds(29),
      }),
    });

    httpApi.addRoutes({
      path: '/doses/today',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('DosesIntegration', dosesFn, {
        timeout: cdk.Duration.seconds(29),
      }),
    });

    httpApi.addRoutes({
      path: '/doses/missed',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('DosesMissedIntegration', dosesFn, {
        timeout: cdk.Duration.seconds(29),
      }),
    });

    httpApi.addRoutes({
      path: '/vials/open',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('VialsIntegration', vialsFn, {
        timeout: cdk.Duration.seconds(29),
      }),
    });

    httpApi.addRoutes({
      path: '/doses/{id}/given',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('DoseGivenIntegration', doseGivenFn, {
        timeout: cdk.Duration.seconds(29),
      }),
    });

    // 13. Plan Handler Lambda (Vial-Batching Projection & Slot Assignment)
    const planFn = new NodejsFunction(this, 'PlanHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../api/src/handlers/plan.ts'),
      projectRoot: apiProjectRoot,
      depsLockFilePath,
      handler: 'handler',
      environment: {
        ...dbEnv,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      bundling: commonBundling,
    });

    httpApi.addRoutes({
      path: '/plan/tomorrow',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('PlanTomorrowIntegration', planFn, {
        timeout: cdk.Duration.seconds(29),
      }),
    });

    // 14. Metrics Handler Lambda (Completion Funnel, Vial Efficiency & Delivery Rates)
    const metricsFn = new NodejsFunction(this, 'MetricsHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../api/src/handlers/metrics.ts'),
      projectRoot: apiProjectRoot,
      depsLockFilePath,
      handler: 'handler',
      environment: {
        ...dbEnv,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      bundling: commonBundling,
    });

    httpApi.addRoutes({
      path: '/metrics',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('MetricsIntegration', metricsFn, {
        timeout: cdk.Duration.seconds(29),
      }),
    });

    // 15. FHIR R4 Immunization Handler Lambda (ABDM & National Health Record interoperability)
    const fhirFn = new NodejsFunction(this, 'FhirHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../api/src/handlers/fhir.ts'),
      projectRoot: apiProjectRoot,
      depsLockFilePath,
      handler: 'handler',
      environment: {
        ...dbEnv,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      bundling: commonBundling,
    });

    httpApi.addRoutes({
      path: '/fhir/Immunization/{doseId}',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('FhirImmunizationIntegration', fhirFn, {
        timeout: cdk.Duration.seconds(29),
      }),
    });

    // 15. Operational CloudWatch Dashboard for Live Judging & Observability
    const dashboard = new cloudwatch.Dashboard(this, 'OperationsDashboard', {
      dashboardName: 'PooraTeeka-Operations',
      defaultInterval: cdk.Duration.hours(3),
    });

    dashboard.addWidgets(
      // Row 1: Poora Teeka Core Custom Metrics
      new cloudwatch.GraphWidget({
        title: 'Poora Teeka - Patient Reminders Sent & Failed',
        left: [
          new cloudwatch.Metric({
            namespace: 'PooraTeeka',
            metricName: 'RemindersSent',
            dimensionsMap: { Kind: 'PRE' },
            statistic: 'Sum',
            label: 'Pre-Reminders Sent',
            color: '#10b981',
          }),
          new cloudwatch.Metric({
            namespace: 'PooraTeeka',
            metricName: 'RemindersSent',
            dimensionsMap: { Kind: 'MISSED' },
            statistic: 'Sum',
            label: 'Missed-Dose Alerts Sent',
            color: '#f59e0b',
          }),
          new cloudwatch.Metric({
            namespace: 'PooraTeeka',
            metricName: 'RemindersFailed',
            statistic: 'Sum',
            label: 'Reminders Failed',
            color: '#ef4444',
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Poora Teeka - Overdue Doses Flagged (Sweep)',
        left: [
          new cloudwatch.Metric({
            namespace: 'PooraTeeka',
            metricName: 'DosesMarkedMissed',
            statistic: 'Sum',
            label: 'Doses Marked Missed',
            color: '#8b5cf6',
          }),
        ],
        width: 12,
        height: 6,
      }),

      // Row 2: Lambda Invocations & Errors across key functions
      new cloudwatch.GraphWidget({
        title: 'Lambda Functions - Invocations (Activity)',
        left: [
          reminderWorkerFn.metricInvocations({ label: 'Reminder Worker', color: '#10b981' }),
          missedDoseSweepFn.metricInvocations({ label: 'Missed Dose Sweep', color: '#8b5cf6' }),
          planFn.metricInvocations({ label: 'Batching Planner', color: '#3b82f6' }),
          scheduleCreatorFn.metricInvocations({ label: 'Schedule Creator', color: '#f59e0b' }),
          outboxPollerFn.metricInvocations({ label: 'Outbox Poller', color: '#6366f1' }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Functions - Error Counts',
        left: [
          reminderWorkerFn.metricErrors({ label: 'Reminder Worker Errors', color: '#ef4444' }),
          missedDoseSweepFn.metricErrors({ label: 'Missed Dose Sweep Errors', color: '#f87171' }),
          planFn.metricErrors({ label: 'Planner Errors', color: '#fca5a5' }),
          scheduleCreatorFn.metricErrors({ label: 'Schedule Creator Errors', color: '#fb923c' }),
        ],
        width: 12,
        height: 6,
      }),

      // Row 3: API Gateway Latency & Status Codes
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Latency (p95 & Average)',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Latency',
            dimensionsMap: { ApiId: httpApi.apiId },
            statistic: 'p95',
            label: 'Latency (p95 ms)',
            color: '#3b82f6',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'IntegrationLatency',
            dimensionsMap: { ApiId: httpApi.apiId },
            statistic: 'Average',
            label: 'Integration Latency (avg ms)',
            color: '#06b6d4',
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Requests & Errors (4xx / 5xx)',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Count',
            dimensionsMap: { ApiId: httpApi.apiId },
            statistic: 'Sum',
            label: 'Total Requests',
            color: '#64748b',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '4xx',
            dimensionsMap: { ApiId: httpApi.apiId },
            statistic: 'Sum',
            label: '4xx Client Errors',
            color: '#f59e0b',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '5xx',
            dimensionsMap: { ApiId: httpApi.apiId },
            statistic: 'Sum',
            label: '5xx Server Errors',
            color: '#ef4444',
          }),
        ],
        width: 12,
        height: 6,
      })
    );

    // CfnOutput exposing the deployed HTTP API URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.url ?? httpApi.apiEndpoint,
      description: 'Poora Teeka HTTP API URL',
    });

    new cdk.CfnOutput(this, 'ReminderQueueUrl', {
      value: reminderQueue.queueUrl,
      description: 'Poora Teeka SQS Reminder Queue URL',
    });

    new cdk.CfnOutput(this, 'OutboxDLQUrl', {
      value: dlq.queueUrl,
      description: 'Poora Teeka SQS Outbox DLQ URL',
    });

    new cdk.CfnOutput(this, 'AudioBucketName', {
      value: audioBucket.bucketName,
      description: 'Poora Teeka S3 Audio Bucket Name',
    });

    new cdk.CfnOutput(this, 'WhatsAppSecretName', {
      value: whatsappSecret.secretName,
      description: 'Poora Teeka Secrets Manager Secret Name',
    });

    new cdk.CfnOutput(this, 'TypeSafeSecretName', {
      value: typesafeSecret.secretName,
      description: 'Poora Teeka TypeSafe AI Secrets Manager Secret Name',
    });

    new cdk.CfnOutput(this, 'MissedDoseSweepFunctionName', {
      value: missedDoseSweepFn.functionName,
      description: 'Poora Teeka Missed Dose Sweep Lambda Function Name',
    });

    new cdk.CfnOutput(this, 'PlanFunctionName', {
      value: planFn.functionName,
      description: 'Poora Teeka Plan Lambda Function Name',
    });

    new cdk.CfnOutput(this, 'MetricsFunctionName', {
      value: metricsFn.functionName,
      description: 'Poora Teeka Metrics Lambda Function Name',
    });

    new cdk.CfnOutput(this, 'CloudWatchDashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards/dashboard/PooraTeeka-Operations`,
      description: 'Poora Teeka Live CloudWatch Operations Dashboard URL',
    });
  }
}

