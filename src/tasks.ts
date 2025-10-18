import { CloudTasksClient } from '@google-cloud/tasks';

const client = new CloudTasksClient();

interface QueueConfig {
  projectId: string;
  location: string;
  queueId: string;
  workerUrl: string;
}

function getQueueConfig(): QueueConfig {
  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_LOCATION;
  const queueId = process.env.TASKS_QUEUE_ID;
  const workerUrl = process.env.PUBLIC_WORKER_URL;

  if (!projectId || !location || !queueId || !workerUrl) {
    throw new Error('Missing Cloud Tasks configuration. Check environment variables.');
  }

  return { projectId, location, queueId, workerUrl };
}

export async function enqueue(payload: unknown): Promise<string | undefined> {
  const { projectId, location, queueId, workerUrl } = getQueueConfig();
  const parent = client.queuePath(projectId, location, queueId);

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: workerUrl,
      headers: {
        'Content-Type': 'application/json'
      },
      body: Buffer.from(JSON.stringify(payload)).toString('base64')
    }
  };

  const [response] = await client.createTask({ parent, task });
  return response.name;
}
