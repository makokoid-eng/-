import { CloudTasksClient, protos } from '@google-cloud/tasks';

const client = new CloudTasksClient();

interface QueueConfig {
  projectId: string;
  location: string;
  queueId: string;
  workerUrl: string;
  serviceAccountEmail?: string;
}

function getQueueConfig(): QueueConfig {
  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_LOCATION;
  const queueId = process.env.TASKS_QUEUE_ID;
  const workerUrl = process.env.PUBLIC_WORKER_URL;
  const serviceAccountEmail = process.env.TASKS_SA_EMAIL;

  if (!projectId || !location || !queueId || !workerUrl) {
    throw new Error('Missing Cloud Tasks configuration. Check environment variables.');
  }

  return { projectId, location, queueId, workerUrl, serviceAccountEmail: serviceAccountEmail || undefined };
}

export async function enqueue(payload: unknown): Promise<string | undefined> {
  const { projectId, location, queueId, workerUrl, serviceAccountEmail } = getQueueConfig();
  const parent = client.queuePath(projectId, location, queueId);

  const httpRequest: protos.google.cloud.tasks.v2.IHttpRequest = {
    httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
    url: workerUrl,
    headers: {
      'Content-Type': 'application/json'
    },
    body: Buffer.from(JSON.stringify(payload)).toString('base64')
  };

  if (serviceAccountEmail) {
    httpRequest.oidcToken = {
      serviceAccountEmail
    };
  }

  const task: protos.google.cloud.tasks.v2.ITask = {
    httpRequest
  };

  const [response] = await client.createTask({ parent, task });
  return response.name ?? undefined;
}
