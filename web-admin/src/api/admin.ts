import { callCloud } from './client';

export async function adminLogin(username: string, password: string) {
  return callCloud<{ code: number; token: string; admin: { id: string; username: string; role: string } }>(
    '_admin/adminLogin',
    { username, password }
  );
}
