const dotenv = require("dotenv")

dotenv.config()

// Discord bot login
const Discord = require("discord.js")
const discordClient = new Discord.Client({ intents: ["MessageContent", "GuildMessages", "GuildMembers", "Guilds"] })

discordClient.on("ready", () => {
  console.log(`Logged in as ${discordClient.user.tag}!`)
})

discordClient.on("messageCreate", async msg => {
  console.log(msg.content)
  if (msg.content === "ping") {
    msg.reply("pong");
  }
})

export async function sendMessage(channelID, message) {
  await discordClient.channels.fetch(channelID);
  discordClient.channels.cache.get(channelID).send({ content: message });
}

discordClient.login(process.env.DISCORD_TOKEN)