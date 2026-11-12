// Backend address (same structure as Open Coding Society pages assets/js/api/config.js)
// Locally: run `make` in the xrcare-backend repo (port 8620).
// Deployed: set deployedPythonURI to the backend's HTTPS address once it is hosted.
const deployedPythonURI = "";

export var pythonURI;
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    pythonURI = `http://${location.hostname}:8620`;  // Same host name as the page so the login cookie is sent
} else {
    pythonURI = deployedPythonURI;
}

export const fetchOptions = {
    method: 'GET', // Default method is GET
    mode: 'cors', // Enable CORS (Cross-Origin Resource Sharing)
    cache: 'default', // Default caching behavior
    credentials: 'include', // Include credentials (cookies, etc.)
    headers: {
        'Content-Type': 'application/json',
        'X-Origin': 'client' // Custom header to identify source
    },
};

// Shared request helper: returns parsed JSON, or throws an Error with the server's message
export async function apiRequest(path, method = 'GET', body) {
    if (!pythonURI) {
        throw new Error("The XRCare server has not been connected to this site yet.");
    }
    let response;
    try {
        response = await fetch(pythonURI + path, {
            ...fetchOptions,
            method,
            cache: 'no-store',
            body: body ? JSON.stringify(body) : undefined
        });
    } catch (error) {
        // Network failure: backend not running, or blocked by CORS
        console.log('Possible CORS or Service Down error: ' + error);
        throw new Error(`Can't reach the XRCare server at ${pythonURI}. Please try again shortly.`);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw Object.assign(new Error(data.message || `Request failed: ${response.status}`), { status: response.status });
    }
    return data;
}
