import { AuthenticationCreds, AuthenticationState, initAuthCreds, SignalDataTypeMap, BufferJSON } from '@whiskeysockets/baileys';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL!.replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY! || process.env.SUPABASE_ANON_KEY!;
console.log('[Supabase Init] Raw URL:', process.env.SUPABASE_URL);
console.log('[Supabase Init] Sanitized URL:', supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseKey);

export const useSupabaseAuthState = async (
    sessionId: string
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
    
    const writeData = async (keyName: string, data: any) => {
        try {
            const strData = JSON.stringify(data, BufferJSON.replacer);
            const value = JSON.parse(strData);
            
            const { error } = await supabase
                .from('whatsapp_sessions')
                .upsert(
                    { session_id: sessionId, key_name: keyName, key_value: value },
                    { onConflict: 'session_id, key_name' }
                );
                
            if (error) {
                console.error(`[Supabase Auth] Erro ao salvar ${keyName} na sessão ${sessionId}:`, error.message);
                console.error(`[Supabase Auth] Detalhes do erro:`, JSON.stringify(error, null, 2));
                if ('cause' in error) {
                    console.error(`[Supabase Auth] Causa do erro:`, (error as any).cause);
                }
            }
        } catch (err: any) {
            console.error(`[Supabase Auth] Exceção ao serializar/salvar ${keyName}:`, err);
            if (err && err.cause) {
                console.error(`[Supabase Auth] Causa da exceção:`, err.cause);
            }
        }
    };

    const readData = async (keyName: string) => {
        try {
            const { data, error } = await supabase
                .from('whatsapp_sessions')
                .select('key_value')
                .eq('session_id', sessionId)
                .eq('key_name', keyName)
                .single();

            if (error) {
                console.error(`[Supabase Auth] Erro ao ler ${keyName} na sessão ${sessionId}:`, error.message);
                return null;
            }
            if (!data) return null;

            const strData = JSON.stringify(data.key_value);
            return JSON.parse(strData, BufferJSON.reviver);
        } catch (err: any) {
            console.error(`[Supabase Auth] Exceção ao ler ${keyName}:`, err);
            return null;
        }
    };

    const removeData = async (keyName: string) => {
        try {
            await supabase
                .from('whatsapp_sessions')
                .delete()
                .eq('session_id', sessionId)
                .eq('key_name', keyName);
        } catch (error) {
            console.error(`[Supabase Auth] Erro ao remover ${keyName}:`, error);
        }
    };

    let creds: AuthenticationCreds;
    const credsData = await readData('creds');
    if (credsData) {
        creds = credsData as AuthenticationCreds;
    } else {
        creds = initAuthCreds();
    }

    const saveCreds = async () => {
        await writeData('creds', creds);
    };

    const keys = {
        get: async (type: keyof SignalDataTypeMap, ids: string[]) => {
            const data: { [id: string]: any } = {};
            await Promise.all(
                ids.map(async (id) => {
                    const keyName = `${type}-${id}`;
                    let value = await readData(keyName);
                    
                    if (type === 'app-state-sync-key' && value) {
                        // BufferJSON.reviver já cuida da desserialização
                    }
                    
                    if (value) {
                        data[id] = value;
                    }
                })
            );
            return data;
        },
        set: async (data: any) => {
            const tasks: Promise<void>[] = [];
            for (const category in data) {
                for (const id in data[category]) {
                    const value = data[category][id];
                    const keyName = `${category}-${id}`;
                    if (value) {
                        tasks.push(writeData(keyName, value));
                    } else {
                        tasks.push(removeData(keyName));
                    }
                }
            }
            await Promise.all(tasks);
        }
    };

    return {
        state: { creds, keys },
        saveCreds
    };
};
