const config = require("./config")
const axios = require("axios")

module.exports = async (sock, msg) => {
  const from = msg.key.remoteJid
  const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ""
  
  const isCmd = body.startsWith(config.prefix)
  const command = isCmd ? body.slice(1).split(" ")[0] : ""
  const args = body.split(" ").slice(1)

  if (isCmd) {
    switch (command) {

      case "menu":
        return sock.sendMessage(from, {
          text: `
╔═══『 ${config.botName} 』
║ .menu
║ .ai
║ .tt
║ .owner
╚═══════════
`
        })

      case "owner":
        return sock.sendMessage(from, {
          text: `Owner: wa.me/${config.owner}`
        })

      case "ai":
        if (!args[0]) return sock.sendMessage(from, { text: "Masukkan pertanyaan!" })
        
        const res = await axios.get(`https://api.affiliateplus.xyz/api/chatbot?message=${args.join(" ")}`)
        return sock.sendMessage(from, { text: res.data.message })

      case "tt":
        if (!args[0]) return sock.sendMessage(from, { text: "Masukkan link TikTok!" })

        return sock.sendMessage(from, {
          text: "Fitur download TikTok masih basic (bisa dikembangkan)"
        })

    }
  }

  // AUTO RESPON
  if (body.toLowerCase().includes("halo")) {
    sock.sendMessage(from, { text: "Halo juga 👋" })
  }
}