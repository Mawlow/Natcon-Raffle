import axios from 'axios';

/**
 * Same-origin SPA client.
 *
 * CSRF protection rides on the XSRF-TOKEN cookie rather than the page's meta
 * tag: Laravel rotates the token when the session is regenerated at login, and
 * the cookie always carries the current value while a cached meta tag does not.
 * Axios reads that cookie and mirrors it into the X-XSRF-TOKEN header.
 */
const api = axios.create({
    baseURL: '/api',
    withCredentials: true,
    withXSRFToken: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN',
    headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
    },
});

/** Normalises Laravel's error shapes into a single message plus field errors. */
export function parseError(error, fallback = 'Something went wrong.') {
    const response = error?.response;

    if (!response) {
        return { message: 'Cannot reach the server. Check your connection.', errors: {}, status: 0 };
    }

    if (response.status === 419) {
        return {
            message: 'Your session expired. Please reload the page and sign in again.',
            errors: {},
            status: 419,
        };
    }

    const data = response.data ?? {};
    const errors = data.errors ?? {};
    const firstFieldError = Object.values(errors)[0]?.[0];

    return {
        message: data.message || firstFieldError || fallback,
        errors,
        status: response.status,
        code: data.code,
    };
}

export default api;
