const localtunnel = require('localtunnel');
const https = require('https');

// Function to get external IP for localtunnel password
function getExternalIp() {
    return new Promise((resolve, reject) => {
        https.get('https://api.ipify.org', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', (err) => reject(err));
    });
}

(async () => {
    try {
        console.log('Starting tunnel...');

        // Fetch IP for password
        let ip = 'Unknown';
        try {
            ip = await getExternalIp();
            console.log('\n\x1b[33m%s\x1b[0m', '------------------------------------------------------------');
            console.log('\x1b[32m%s\x1b[0m', `Tunnel Password: ${ip}`);
            console.log('\x1b[33m%s\x1b[0m', '------------------------------------------------------------\n');
        } catch (e) {
            console.log('Could not fetch public IP for password.');
        }

        const tunnel = await localtunnel({
            port: 5173,
            local_host: '127.0.0.1'
        });

        console.log('Your URL is:', tunnel.url);

        tunnel.on('close', () => {
            console.log('Tunnel closed');
        });

        tunnel.on('error', (err) => {
            console.error('Tunnel error:', err);
        });

    } catch (err) {
        console.error('Error starting tunnel:', err);
    }
})();
