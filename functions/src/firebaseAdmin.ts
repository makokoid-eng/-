import * as admin from 'firebase-admin';

let app: admin.app.App | null = null;

export const getFirebaseAdmin = (): typeof admin => {
  if (!app) {
    app = admin.apps.length > 0 ? admin.app() : admin.initializeApp();
  }

  return admin;
};
