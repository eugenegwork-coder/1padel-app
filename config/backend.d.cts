declare const backend: {
  apiOrigin(value: string): string;
  resolveBackend(options?: { apiBaseUrl?: string; platform?: string; webOrigin?: string; localScheduleProxy?: boolean }): {
    apiBaseUrl: string; scheduleBaseUrl: string; sessionKey: string; googleAvailable: boolean;
  };
};
export = backend;
