const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const HOST = '127.0.0.1';
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'properties.json');

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.xml': 'application/xml; charset=UTF-8',
    '.txt': 'text/plain; charset=UTF-8',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf'
};

function readProperties() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (err) {
        console.error('Error reading properties.json:', err);
    }
    return [];
}

function writeProperties(data) {
    try {
        fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('Error writing properties.json:', err);
        return false;
    }
}

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
            if (body.length > 20 * 1024 * 1024) { // 20 MB limit
                reject(new Error('Request body too large'));
            }
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    // Enable CORS for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(urlObj.pathname);

    // =========================================================================
    // REST API FOR LOCAL BACKEND PROPERTIES (Direct file sync with properties.json)
    // =========================================================================
    if (pathname === '/api/properties' || pathname.startsWith('/api/properties/')) {
        res.setHeader('Content-Type', 'application/json; charset=UTF-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        // GET /api/properties -> Read list directly from data/properties.json
        if (req.method === 'GET' && pathname === '/api/properties') {
            const properties = readProperties();
            res.writeHead(200);
            res.end(JSON.stringify(properties));
            return;
        }

        // POST /api/properties -> Save or update property in data/properties.json
        if (req.method === 'POST' && pathname === '/api/properties') {
            try {
                const payload = await parseJsonBody(req);
                let properties = readProperties();

                if (payload.action === 'reset') {
                    // Reset to seed if requested
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, count: properties.length }));
                    return;
                }

                const item = payload;
                if (!item.id) {
                    item.id = `prop-${Date.now()}`;
                    item.created_at = new Date().toISOString();
                    properties.unshift(item);
                } else {
                    const idx = properties.findIndex(p => p.id === item.id);
                    if (idx >= 0) {
                        properties[idx] = { ...properties[idx], ...item };
                    } else {
                        properties.unshift(item);
                    }
                }

                writeProperties(properties);
                console.log(`[Backend Saved] Property "${item.title}" saved to data/properties.json`);

                res.writeHead(200);
                res.end(JSON.stringify({ success: true, property: item }));
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
            return;
        }

        // DELETE /api/properties/:id -> Remove property from data/properties.json
        if (req.method === 'DELETE' && pathname.startsWith('/api/properties/')) {
            const id = pathname.slice('/api/properties/'.length).trim();
            let properties = readProperties();
            const originalLen = properties.length;
            properties = properties.filter(p => p.id !== id);
            writeProperties(properties);
            console.log(`[Backend Deleted] Property "${id}" removed from data/properties.json`);

            res.writeHead(200);
            res.end(JSON.stringify({ success: true, deleted: originalLen !== properties.length }));
            return;
        }
    }

    // =========================================================================
    // STATIC FILE SERVING
    // =========================================================================
    let filePath = path.join(ROOT, pathname);

    if (pathname === '/' || pathname === '') {
        filePath = path.join(ROOT, 'index.html');
    } else {
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            if (fs.existsSync(filePath + '.html')) {
                filePath = filePath + '.html';
            } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
                filePath = path.join(filePath, 'index.html');
            }
        }
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
            res.end('<h1>404 Not Found</h1><p><a href="/">Return Home</a></p>');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
        });

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    });
});

server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}/`);
});
