// api/test-proxy.js
// Real proxy tester for Vercel

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    // Only POST allowed
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { ip, port, type = 'http' } = req.body;
    
    if (!ip || !port) {
        return res.status(400).json({ error: 'IP and port required' });
    }
    
    try {
        const result = await testProxy(ip, port, type);
        
        // Get country info (optional)
        const country = await getCountry(ip);
        
        res.json({
            ...result,
            ip,
            port,
            country: country || '??',
            timestamp: Date.now()
        });
        
    } catch (error) {
        res.status(500).json({ 
            error: 'Testing failed',
            message: error.message 
        });
    }
};

// Main proxy testing function
function testProxy(ip, port, type) {
    return new Promise((resolve) => {
        const net = require('net');
        const startTime = Date.now();
        
        const socket = new net.Socket();
        socket.setTimeout(5000); // 5 second timeout
        
        socket.connect(port, ip, () => {
            // Connected to proxy server
            if (type === 'http' || type === 'https') {
                // Send HTTP CONNECT request
                const connectReq = `CONNECT httpbin.org:80 HTTP/1.1\r\nHost: httpbin.org\r\n\r\n`;
                socket.write(connectReq);
            } else {
                // SOCKS or other types
                resolve({
                    live: true,
                    speed: Date.now() - startTime,
                    type: 'connected',
                    note: 'TCP connection successful'
                });
                socket.destroy();
            }
        });
        
        socket.on('data', (data) => {
            const response = data.toString();
            const speed = Date.now() - startTime;
            
            // Check if proxy accepted CONNECT
            if (response.includes('200') || response.includes('Connection established')) {
                // Now test actual HTTP request through proxy
                const httpGet = `GET http://httpbin.org/ip HTTP/1.1\r\nHost: httpbin.org\r\n\r\n`;
                socket.write(httpGet);
                
                // Wait for response
                setTimeout(() => {
                    resolve({
                        live: true,
                        speed: speed,
                        type: 'http',
                        note: 'HTTP CONNECT successful'
                    });
                    socket.destroy();
                }, 1000);
            } else {
                resolve({
                    live: true,
                    speed: speed,
                    type: 'unknown',
                    note: 'Connected but unexpected response'
                });
                socket.destroy();
            }
        });
        
        socket.on('timeout', () => {
            resolve({
                live: false,
                error: 'Connection timeout',
                speed: Date.now() - startTime
            });
            socket.destroy();
        });
        
        socket.on('error', (err) => {
            resolve({
                live: false,
                error: err.message,
                speed: Date.now() - startTime
            });
            socket.destroy();
        });
    });
}

// Get country from IP (free API)
async function getCountry(ip) {
    try {
        const https = require('https');
        
        return new Promise((resolve) => {
            https.get(`https://ipapi.co/${ip}/country/`, (resp) => {
                let data = '';
                resp.on('data', chunk => data += chunk);
                resp.on('end', () => resolve(data.trim()));
            }).on('error', () => resolve(null));
        });
    } catch {
        return null;
    }
}