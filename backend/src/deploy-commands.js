require('dotenv').config();

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const { DISCORD_TOKEN: token, DISCORD_CLIENT_ID: clientId, DISCORD_GUILD_ID: guildId } = process.env;

if (!token || !clientId || !guildId) {
  console.error('DISCORD_TOKEN, DISCORD_CLIENT_ID, and DISCORD_GUILD_ID are required.');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether the bot is responding.'),
].map((command) => command.toJSON());

const rest = new REST().setToken(token);

async function checkDate(){
  const response = await fetch("https://mws.cdn.weathernews.jp/s/quake/json/quake.json?");
  // APIのリクエストに失敗したら
  if(!response.ok){
    console.log("request失敗");
    return;
  }
  const currentData = await response.json();
}
async function deployCommands() {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commands,
  });

  console.log(`Deployed ${commands.length} command(s) to guild ${guildId}.`);
}

deployCommands().catch((error) => {
  console.error(error);
  process.exit(1);
});
