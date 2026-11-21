const express = require('express');
const https = require('https');
const { execFile } = require('child_process');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// সরাসরি ফেসবুক পেজ থেকে ভিডিও লিংক বের করার ফাংশন (IP ব্লক এড়াতে)
function scrapeFacebookVideo(videoUrl) {
    return new Promise((resolve, reject) => {
        // লিংকটিকে মোবাইল ভার্সনে রূপান্তর
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
            // রিডাইরেক্ট (যেমন /share/ লিংক) অনুসরণ করা
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(scrapeFacebookVideo(res.headers.location));
            }

            let html = '';
            res.on('data', chunk => html += chunk);
            res.on('end', () => {
                // HD অথবা SD ভিডিও লিংক খোঁজা
                const hdMatch = html.match(/"playable_url_quality_hd":"([^"]+)"/);
                const sdMatch = html.match(/"playable_url":"([^"]+)"/);
                const fallbackMatch = html.match(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/);

                let rawUrl = (hdMatch && hdMatch[1]) || (sdMatch && sdMatch[1]) || (fallbackMatch && fallbackMatch[0]);

                if (rawUrl) {
                    // ইউনিকোড ক্যারেক্টার পরিষ্কার করা
                    const cleanUrl = rawUrl.replace(/\\u0025/g, '%').replace(/\\\//g, '/').replace(/&amp;/g, '&');
                    resolve(cleanUrl);
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

    // প্রথমে মোবাইল স্ক্র্যাপার দিয়ে চেষ্টা করবে (সবার জন্য পাবলিকভাবে কাজ করবে)
    try {
        const directUrl = await scrapeFacebookVideo(videoUrl);
        return res.json({ downloadUrl: directUrl });
    } catch (scrapeErr) {
        // ব্যর্থ হলে বিকল্প হিসেবে yt-dlp দিয়ে চেষ্টা করবে
        const args = [
            '-g',
            '-f', 'best[ext=mp4]/best',
            '--no-playlist',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            videoUrl
        ];

        execFile('yt-dlp', args, (error, stdout) => {
            if (error || !stdout.trim()) {
                return res.status(500).json({ 
                    error: 'Could not download. Make sure the video is Public (not from a private group/profile).' 
                });
            }
            const directUrl = stdout.trim().split('\n')[0];
            res.json({ downloadUrl: directUrl });
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
