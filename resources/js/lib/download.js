import api from './api';

/**
 * Downloads a file from the API to this device: fetched with the signed-in
 * session like every other request, then saved under the name the server
 * gives it (or `fallbackName`).
 */
export async function downloadFile(path, fallbackName) {
    const response = await api.get(path, { responseType: 'blob' });
    const disposition = response.headers['content-disposition'] ?? '';
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    const name = match ? decodeURIComponent(match[1]) : fallbackName;

    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
