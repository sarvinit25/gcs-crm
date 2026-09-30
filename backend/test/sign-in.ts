/* eslint-disable @typescript-eslint/no-explicit-any */
/** Signs in; accounts created by an admin must pick their own password first, so do that transparently. */
export async function signIn(
  post: (path: string, token: string | undefined, body: object) => Promise<{ body: any }>,
  email: string,
  password: string,
) {
  let res = await post("/auth/login", undefined, { email, password });
  if (res.body.user?.mustChangePassword) {
    const next = `${password}-changed`;
    await post("/auth/change-password", res.body.accessToken, { currentPassword: password, newPassword: next });
    res = await post("/auth/login", undefined, { email, password: next });
  }
  return res.body.accessToken as string;
}
