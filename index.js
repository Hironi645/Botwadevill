const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const http = require('http');

// ============================================================
//   ⚙️  KONFIGURASI — EDIT BAGIAN INI
// ============================================================
const CONFIG = {
    // Nomor WA kamu (format 62xxx, tanpa + atau spasi)
    phoneNumber: '628xxxxxxxxxx',

    // Port web server untuk lihat pairing code di browser
    webPort: 3000,

    sessionDir: './sessions',

    welcomeMessage: `╔══════════════════════════╗
║  🎉 WELCOME TO SQ HH DR 🎉  ║
╚══════════════════════════╝

Halo @{nomor}! 👋

Selamat datang di *SQ HH DR* 🙌
Senang kamu bergabung bersama kami!

📌 *Harap perhatikan:*
• Baca dan ikuti aturan grup
• Jaga sopan santun & saling menghormati
• Dilarang spam & promosi tanpa izin

Semoga betah dan enjoy ya! 😊🔥

_— Admin SQ HH DR_`,
};

// ============================================================
//   STATE GLOBAL
// ============================================================
const logger = pino({ level: 'silent' });
let pairingCode = null;
let botStatus = 'starting';

// ============================================================
//   WEB SERVER — buka http://localhost:3000 di browser
// ============================================================
function startWebServer() {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SQ HH DR Bot</title>
  <meta http-equiv="refresh" content="5">
  <style>
    body { font-family: sans-serif; background: #111; color: #eee; display: flex;
           justify-content: center; align-items: center; height: 100vh; margin: 0; flex-direction: column; }
    .box { background: #222; border-radius: 16px; padding: 40px; text-align: center; max-width: 400px; width: 90%; }
    h1 { color: #25D366; margin-bottom: 8px; }
    .code { font-size: 3em; font-weight: bold; letter-spacing: 8px; color: #25D366;
            background: #111; border-radius: 12px; padding: 20px 30px; margin: 24px 0; }
    .status { font-size: 0.9em; color: #aaa; margin-top: 16px; }
    .step { text-align: left; margin-top: 24px; line-height: 2; font-size: 0.95em; }
    .connected { color: #25D366; font-size: 1.4em; font-weight: bold; }
  </style>
</head>
<body>
  <div class="box">
    <h1>🤖 SQ HH DR Bot</h1>
    ${botStatus === 'connected'
        ? `<div class="connected">✅ Bot Terhubung!</div><p>Bot aktif dan memantau grup.</p>`
        : pairingCode
        ? `<p>Masukkan kode ini di WhatsApp:</p>
           <div class="code">${pairingCode}</div>
           <div class="step">
             1️⃣ Buka <b>WhatsApp</b><br>
             2️⃣ Titik 3 ⋮ → <b>Perangkat Tertaut</b><br>
             3️⃣ <b>Tautkan Perangkat</b><br>
             4️⃣ <b>Tautkan dengan nomor telepon</b><br>
             5️⃣ Masukkan kode di atas
           </div>
           <div class="status">Halaman refresh otomatis tiap 5 detik</div>`
        : `<p>⏳ Mempersiapkan bot...</p>
           <div class="status">Halaman refresh otomatis tiap 5 detik</div>`
    }
  </div>
</body>
</html>`);
    });

    server.listen(CONFIG.webPort, () => {
        console.log(`\n🌐 Web server aktif!`);
        console.log(`   Buka browser → http://localhost:${CONFIG.webPort}`);
        console.log(`   (Di Termux, pairing code akan tampil di sana)\n`);
    });
}

// ============================================================
//   UTILITY
// ============================================================
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function formatWelcome(template, nomor) {
    return template.replace(/\{nomor\}/g, nomor).replace(/\{nama\}/g, nomor);
}

if (!fs.existsSync(CONFIG.sessionDir)) fs.mkdirSync(CONFIG.sessionDir, { recursive: true });

// ============================================================
//   MAIN BOT
// ============================================================
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(CONFIG.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: ['SQ HH DR Bot', 'Chrome', '120.0.0'],
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
    });

    // ── Pairing Code ──────────────────────────────────────────
    if (!sock.authState.creds.registered) {
        await sleep(3000);

        const phoneNumber = CONFIG.phoneNumber.replace(/[^0-9]/g, '');

        if (!phoneNumber || phoneNumber === '628xxxxxxxxxx') {
            console.log('\n❌ STOP! Isi dulu CONFIG.phoneNumber di index.js dengan nomor WA kamu!');
            console.log("   Contoh: phoneNumber: '6281234567890'\n");
            process.exit(1);
        }

        console.log(`📱 Meminta pairing code untuk: +${phoneNumber} ...`);

        try {
            const code = await sock.requestPairingCode(phoneNumber);
            pairingCode = code;
            botStatus = 'waiting_pairing';

            console.log('\n╔══════════════════════════════════╗');
            console.log(`║   🔑 PAIRING CODE: ${code}     ║`);
            console.log('╚══════════════════════════════════╝');
            console.log(`\n👆 Atau buka browser: http://localhost:${CONFIG.webPort}\n`);
        } catch (err) {
            console.error('❌ Gagal mendapatkan pairing code:', err.message);
            process.exit(1);
        }
    }

    // ── Connection Update ─────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
            botStatus = 'disconnected';
            console.log(`\n⚠️  Koneksi terputus (kode: ${code})`);

            if (code === DisconnectReason.loggedOut) {
                console.log('🔴 Sesi logout. Hapus folder sessions/ lalu jalankan ulang.');
                fs.rmSync(CONFIG.sessionDir, { recursive: true, force: true });
                process.exit(0);
            }

            console.log('🔄 Reconnect dalam 3 detik...');
            await sleep(3000);
            startBot();
        }

        if (connection === 'open') {
            pairingCode = null;
            botStatus = 'connected';
            const me = sock.user?.id?.split(':')[0] || '-';
            console.log(`\n✅ Bot terhubung! Nomor: ${me}`);
            console.log('👀 Memantau anggota baru di semua grup...\n');
        }
    });

    // ── Simpan Kredensial ─────────────────────────────────────
    sock.ev.on('creds.update', saveCreds);

    // ── Welcome Member Baru ───────────────────────────────────
    sock.ev.on('group-participants.update', async (event) => {
        const { id: groupJid, participants, action } = event;

        if (action !== 'add') return;

        for (const participant of participants) {
            try {
                const nomor = participant.replace('@s.whatsapp.net', '');
                const welcomeText = formatWelcome(CONFIG.welcomeMessage, nomor);

                await sock.sendMessage(groupJid, {
                    text: welcomeText,
                    mentions: [participant],
                });

                console.log(`🎉 Welcome dikirim ke @${nomor} di grup ${groupJid}`);
                await sleep(500);
            } catch (err) {
                console.error(`❌ Gagal kirim welcome ke ${participant}:`, err.message);
            }
        }
    });

    return sock;
}

// ── Entry Point ───────────────────────────────────────────────
startWebServer();
startBot().catch((err) => {
    console.error('💥 Error fatal:', err);
    process.exit(1);
});
