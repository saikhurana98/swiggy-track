export interface CliOptions {
  output: string | undefined;
  timeoutSeconds: number;
  showHelp: boolean;
  showVersion: boolean;
}

export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}
