import { APP_VERSION } from '../types';

interface AuthorizationToken {
    access_token: string;
    expires_in: number;
    expires_at: number; // calculated
    token_type: string;
}

const TOKEN_STORAGE_KEY = 'wg_epic_auth_token';

export class EpicService {
    private static instance: EpicService;
    private token: AuthorizationToken | null = null;
    private ipcRenderer: any;

    private constructor() {
        if (window.require) {
            const electron = window.require('electron');
            this.ipcRenderer = electron.ipcRenderer;
        }

        // Try restore token
        try {
            const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.expires_at > Date.now()) {
                    this.token = parsed;
                }
            }
        } catch (e) { }
    }

    public static getInstance(): EpicService {
        if (!EpicService.instance) {
            EpicService.instance = new EpicService();
        }
        return EpicService.instance;
    }

    private async authenticate(clientId: string, clientSecret: string): Promise<string> {
        if (this.token && this.token.expires_at > Date.now() + 60000) {
            return this.token.access_token;
        }

        if (!clientId || !clientSecret) {
            throw new Error("Missing Client Credentials");
        }

        if (!this.ipcRenderer) {
            console.error("IPC Renderer not found");
            throw new Error("Electron IPC not available");
        }

        const authString = btoa(`${clientId}:${clientSecret}`);
        console.log("Authenticating with Epic...");

        const response = await this.ipcRenderer.invoke('epic-request', {
            url: 'https://api.epicgames.dev/epic/oauth/v1/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${authString}`
            },
            body: new URLSearchParams({
                grant_type: 'client_credentials'
            }).toString()
        });

        if (!response.ok) {
            const err = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            throw new Error(`Auth Failed: ${response.status} ${err}`);
        }

        const data = response.data;
        this.token = {
            access_token: data.access_token,
            expires_in: data.expires_in,
            token_type: data.token_type,
            expires_at: Date.now() + (data.expires_in * 1000)
        };

        localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(this.token));
        return this.token.access_token;
    }

    public async testAuth(clientId: string, clientSecret: string): Promise<{ success: boolean; error?: string }> {
        try {
            this.token = null; // Force refresh
            await this.authenticate(clientId, clientSecret);
            return { success: true };
        } catch (e: any) {
            console.error(e);
            return { success: false, error: e.message || String(e) };
        }
    }

    private dashUuid(id: string): string {
        if (id.length !== 32) return id;
        return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
    }

    public async resolveAccountIds(accountIds: string[], clientId: string, clientSecret: string): Promise<Record<string, string>> {
        if (accountIds.length === 0) return {};

        const uniqueIds = new Set<string>();
        const originalToCleanMap: Record<string, string[]> = {};

        accountIds.forEach(id => {
            let cleanId = id.toLowerCase().trim();

            // Extract all parts that look like IDs (hex 32-36 chars)
            const parts = cleanId.split('|').map(p => p.trim());
            parts.forEach(part => {
                const targetId = part.replace(/-/g, '');
                if (targetId.length === 32) {
                    const dashed = this.dashUuid(targetId);
                    uniqueIds.add(dashed);
                    uniqueIds.add(targetId);

                    if (!originalToCleanMap[dashed]) originalToCleanMap[dashed] = [];
                    originalToCleanMap[dashed].push(id);
                    if (!originalToCleanMap[targetId]) originalToCleanMap[targetId] = [];
                    originalToCleanMap[targetId].push(id);
                } else if (targetId.length > 0) {
                    uniqueIds.add(targetId);
                    if (!originalToCleanMap[targetId]) originalToCleanMap[targetId] = [];
                    originalToCleanMap[targetId].push(id);
                }
            });
        });

        const idList = Array.from(uniqueIds).filter(id => {
            const dashless = id.replace(/-/g, '');
            return !/^0+$/.test(dashless);
        });

        const results: Record<string, string> = {};
        try {
            const accessToken = await this.authenticate(clientId, clientSecret);

            for (let i = 0; i < idList.length; i += 50) {
                const batch = idList.slice(i, i + 50);
                const query = batch.map(id => `accountId=${id}`).join('&');
                console.log(`[EpicService] Querying batch of ${batch.length} IDs (including dashed fallbacks):`, batch);

                let res = await this.ipcRenderer.invoke('epic-request', {
                    url: `https://api.epicgames.dev/epic/id/v2/accounts?${query}`,
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });

                // Fallback: Individual lookups if batch 500s
                if (!res.ok && res.status === 500) {
                    console.warn(`[EpicService] Batch 500. Attempting individual lookups...`);
                    for (const id of batch) {
                        const iRes = await this.ipcRenderer.invoke('epic-request', {
                            url: `https://api.epicgames.dev/epic/id/v2/accounts?accountId=${id}`,
                            method: 'GET',
                            headers: { 'Authorization': `Bearer ${accessToken}` }
                        });
                        if (iRes.ok && Array.isArray(iRes.data) && iRes.data[0]) {
                            const acc = iRes.data[0];
                            if (acc.displayName) {
                                const originals = originalToCleanMap[id.toLowerCase()] || [];
                                originals.forEach(orig => results[orig] = acc.displayName);
                            }
                        }
                    }
                    continue;
                }

                if (res.ok && Array.isArray(res.data)) {
                    res.data.forEach((acc: any) => {
                        if (acc.displayName) {
                            const returnedId = acc.accountId.toLowerCase();
                            const dashless = returnedId.replace(/-/g, '');

                            // Map back to all permutations of this ID
                            const variations = [returnedId, dashless];
                            variations.forEach(v => {
                                const originals = originalToCleanMap[v] || [];
                                originals.forEach(orig => results[orig] = acc.displayName);
                            });
                        }
                    });
                }
            }
        } catch (error) {
            console.error("[EpicService] Resolution Error:", error);
        }

        return results;
    }
}
