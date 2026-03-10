import { useAuth } from '@clerk/react';

export function useApi() {
  const { getToken } = useAuth();

  const request = async (method, path, body) => {
    const token = await getToken();
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  };

  return {
    get:    (path)         => request('GET',   path),
    post:   (path, body)   => request('POST',  path, body),
    patch:  (path, body)   => request('PATCH', path, body),
    delete: (path)         => request('DELETE', path),
  };
}
