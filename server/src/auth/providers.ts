export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthProvider {
  register(email: string, password: string): Promise<AuthUser>;
  login(email: string, password: string): Promise<AuthUser>;
}

export interface OAuthProvider {
  loginWithGoogle(_code: string): Promise<AuthUser>;
}

export class GoogleProvider implements OAuthProvider {
  async loginWithGoogle(): Promise<AuthUser> {
    throw Object.assign(new Error("Google OAuth not implemented"), { status: 501 });
  }
}
