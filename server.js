const express = require('express');
const https = require('https');
const { execFile } = require('child_process');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

function cleanFbUrl(raw) {
    if (!raw) return null;
    return raw.replace(/\\u0025/g, '%').replace(/\\\//g, '/').replace(/&amp;/g, '&');
}

function scrapeFacebookVideo(videoUrl) {
    return new Promise((resolve, reject) => {
        let targetUrl = videoUrl.replace('://facebook.com', '://facebook.com').replace('://facebook.com', '://facebook.com');
        
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-Mode': 'navigate'
            }
        };

        https.get(targetUrl, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(scrapeFacebookVideo(res.headers.location));
            }

            let html = '';
            res.on('data', chunk => html += chunk);
            res.on('end', () => {
                const hdMatch = html.match(/"playable_url_quality_hd":"([^"]+)"/);
                const sdMatch = html.match(/"playable_url":"([^"]+)"/);
                const fallbackMatch = html.match(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/);

                const hdUrl = cleanFbUrl(hdMatch ? hdMatch : null);
                const sdUrl = cleanFbUrl(sdMatch ? sdMatch : (fallbackMatch ? fallbackMatch : null));

                if (hdUrl || sdUrl) {
                    resolve({ hdUrl, sdUrl });
                } else {
                    reject(new Error('No video link found in HTML'));
                }
            });
        }).on('error', err => reject(err));
    });
}

app.post('/get-video', async (req, res) => {
    const videoUrl = req.body.url;
    try { 
        new URL(videoUrl); 
    } catch (_) {
        return res.status(400).json({ error: 'Please enter a valid Facebook URL.' });
    }

    try {
        const result = await scrapeFacebookVideo(videoUrl);
        return res.json(result);
    } catch (scrapeErr) {
        const args = [
            '-g',
            '-f', 'best[ext=mp4]/worst[ext=mp4]/best',
            '--no-playlist',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            videoUrl
        ];

        execFile('yt-dlp', args, (error, stdout, stderr) => {
            if (error || !stdout.trim()) {
                console.error('yt-dlp Error:', stderr || error.message);
                return res.status(500).json({ 
                    error: 'Could not download. Make sure the video is Public.' 
                });
            }
            const urls = stdout.trim().split('\n');
            res.json({ 
                hdUrl: urls || null, 
                sdUrl: urls || urls || null 
            });
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
