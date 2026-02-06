import { APP_VERSION } from '../types';

export class AccelByteService {
    private static instance: AccelByteService;
    private ipcRenderer: any;

    private constructor() {
        if (window.require) {
            const electron = window.require('electron');
            this.ipcRenderer = electron.ipcRenderer;
        }
    }

    public static getInstance(): AccelByteService {
        if (!AccelByteService.instance) {
            AccelByteService.instance = new AccelByteService();
        }
        return AccelByteService.instance;
    }

    public async resolveUserIds(userIds: string[], baseUrl: string, namespace: string): Promise<Record<string, string>> {
        if (userIds.length === 0 || !baseUrl || !namespace) return {};

        const results: Record<string, string> = {};
        const trimmedBaseUrl = baseUrl.trim();
        const cleanBaseUrl = trimmedBaseUrl.endsWith('/') ? trimmedBaseUrl.slice(0, -1) : trimmedBaseUrl;
        const cleanNamespace = namespace.trim();

        try {
            // Standardize IDs: strip "namespace|" stuff and make sure it's 32-char hex
            const cleanIds = userIds.map(id => {
                const parts = id.split('|');
                let target = parts[parts.length - 1].toLowerCase().trim();
                // If it looks like a hex ID, keep only the hex
                const hexMatch = target.match(/[a-f0-9]{32}/);
                return hexMatch ? hexMatch[0] : target;
            }).filter(id => {
                if (!id || id.length !== 32) return false;
                if (/^0+$/.test(id)) return false; // Skip all-zeros
                return /^[a-f0-9]{32}$/.test(id);
            });

            if (cleanIds.length === 0) return {};

            // AccelByte Public Search API
            const url = `${cleanBaseUrl}/iam/v3/public/namespaces/${cleanNamespace}/users/bulk/basic`;

            console.log(`[AccelByteService] Querying ${cleanIds.length} IDs via POST from ${url}`);

            const res = await this.ipcRenderer.invoke('epic-request', {
                url: url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Ab-Namespace': cleanNamespace
                },
                body: JSON.stringify({
                    userIds: cleanIds
                })
            });

            if (res.ok && res.data && Array.isArray(res.data.data)) {
                res.data.data.forEach((user: any) => {
                    if (user.displayName) results[user.userId] = user.displayName;
                });
            } else if (res.status === 500 || res.status === 404 || res.status === 400) {
                console.warn(`[AccelByteService] Bulk ${res.status}. Attempting deep discovery...`);

                // Fallback Domain Logic: Try common AGS patterns
                const fallbackNamespaces = [cleanNamespace, 'nebula', 'ms', 'moonshot'];
                const fallbackHosts = [
                    cleanBaseUrl,
                    `https://${cleanNamespace}.accelbyte.io`,
                    `https://${cleanNamespace}.prod.gamingservices.accelbyte.io`,
                    `https://nebula.accelbyte.io`
                ];

                const fallbackIds = cleanIds.slice(0, 5);

                for (const id of fallbackIds) {
                    if (results[id]) continue;

                    for (const host of fallbackHosts) {
                        if (results[id]) break;
                        if (!host || host.length < 10) continue;

                        for (const ns of fallbackNamespaces) {
                            if (results[id]) break;

                            // Final stand: try v3 and v4 on all candidate host/namespace pairs
                            const endpoints = [
                                `${host}/iam/v3/public/namespaces/${ns}/users/${id}`,
                                `${host}/iam/v4/public/namespaces/${ns}/users/${id}`
                            ];

                            for (const fbUrl of endpoints) {
                                console.log(`[AccelByteService] Probing: ${fbUrl}`);
                                const fRes = await this.ipcRenderer.invoke('epic-request', {
                                    url: fbUrl,
                                    method: 'GET',
                                    headers: { 'X-Ab-Namespace': ns }
                                });

                                if (fRes.ok && fRes.data && fRes.data.displayName) {
                                    results[id] = fRes.data.displayName;
                                    console.log(`[AccelByteService] DISCOVERY SUCCESS! Found '${fRes.data.displayName}' at ${fbUrl}`);
                                    break;
                                }
                            }
                        }
                    }
                }
            } else {
                console.error("[AccelByteService] Resolution Failed. Full Response:", res);
            }
        } catch (e) {
            console.error("AccelByteService Error:", e);
        }

        return results;
    }
}
