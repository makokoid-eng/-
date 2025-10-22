import { App, getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

function ensureApp(): App {
  const apps = getApps();
  if (apps.length > 0) {
    return apps[0];
  }

  return initializeApp({
    projectId: process.env.GCP_PROJECT_ID
  });
}

export function getDb(): Firestore {
  ensureApp();
  return getFirestore();
}
