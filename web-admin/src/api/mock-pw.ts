// mock-pw.ts - mock 模式下的密码校验(固定 admin/admin)
// 真实后端通过 PBKDF2 哈希
export function hashCheck(username: string, password: string): boolean {
  return username === 'admin' && password === 'admin';
}
