import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { parseError } from '../lib/api';

const AuthContext = createContext(null);

/**
 * Who the API is acting as.
 *
 * There is no sign-in screen: the server adopts the administrator account for
 * every request, so this only fetches that identity to label the header.
 */
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const { data } = await api.get('/me');
            setUser(data.data);
            return data.data;
        } catch {
            setUser(null);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const value = useMemo(() => ({ user, loading, refresh, parseError }), [user, loading, refresh]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth must be used inside an AuthProvider.');
    }

    return context;
}
