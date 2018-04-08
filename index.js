/* jshint esversion: 6 */
// args = TOKEN CLIENTID INTERVAL
const https = require("https"),
      fs = require("fs"),
      Discord = require("discord.js"),
      bot = new Discord.Client(),
      args = process.argv.slice(2),
      channelPath = __dirname + "/.channels",
      token = "NDMxMTE1OTg0MDc0NzAyODU4.DaaDkg.YnVEOz5uxk5WzvMM0hPXWcuhb6k",
      twitchClientID = "icckz0pew5j85ma82d5futbwvdn14a",
      interval = 60 * 1000,
      apiUrl = "https://api.twitch.tv/kraken",
      // two minute
      timeout = 2*60*1000;
var servers = [];
bot.on("ready", async() => {
  console.log(`${bot.user.username} готов к работе`);
  try {
    let link = await bot.generateInvite(["ADMINISTRATOR"]);
    console.log(link);
  } catch(e) {
    console.log(e.stack);
  }
});

function leadingZero(d){
    if(d < 10){
        return "0" + d;
    }else{
        return d;
    }
}

// adds a timestamp before msg/err
function print(msg, err){
    var date = new Date();
    var h = leadingZero(date.getHours());
    var m = leadingZero(date.getMinutes());
    var s = leadingZero(date.getSeconds());

    console.log("[" + h + ":" + m + ":" + s + "]", msg);
    if(err){
        console.log(err);
    }
}

function indexOfObjectByName(array, value){
    for(let i = 0; i < array.length; i++){
        if(array[i].name.toLowerCase().trim() === value.toLowerCase().trim()){
            return i;
        }
    }
    return -1;
}


function exitHandler(opt, err){
    if(err){
        print(err);
    }
    if(opt.save){
        print("Saving channels to " + channelPath + " before exiting");
        print(JSON.stringify(servers));
        fs.writeFileSync(channelPath, JSON.stringify(servers, null, 4));
        print("Done");
    }
    if(opt.exit){
        process.exit();
    }
}

process.on("exit", exitHandler.bind(null, {save:true}));
process.on("SIGINT", exitHandler.bind(null, {exit:true}));
process.on("SIGTERM", exitHandler.bind(null, {exit:true}));
process.on("uncaughtException", exitHandler.bind(null, {exit:true}));


function callApi(server, twitchChannel, callback, getStreamInfo){
    var opt;
    try {
        var apiPath;
        if(getStreamInfo){
            apiPath = "/kraken/streams/" + twitchChannel.name.trim();
        }else{
            apiPath = "/kraken/channels/" + twitchChannel.name.trim();
        }
        opt = {
            host: "api.twitch.tv",
            path: apiPath,
            headers: {
                "Client-ID": twitchClientID,
                Accept: "application/vnd.twitchtv.v3+json"
            }
        };
    }
    catch(err){
        print(err);
        return;
    }

    https.get(opt, (res)=>{
        var body = "";

        res.on("data", (chunk)=>{
            body += chunk;
        });

        res.on("end", ()=>{
            var json;
            try {
                json = JSON.parse(body);
            }
            catch(err){
                print(err);
                return;
            }
            if(json.status == 404){
                callback(server, undefined, undefined);
            }else{
                callback(server, twitchChannel, json);
            }
        });

    }).on("error", (err)=>{
        print(err);
    });
}


function apiCallback(server, twitchChannel, res){
    if(res && !twitchChannel.online && res.stream &&
       twitchChannel.timestamp + timeout <= Date.now()){
        try {
            var channels = [], defaultChannel;
            var guild = bot.guilds.find("name", server.name);


            if(server.discordChannels.length === 0){
                defaultChannel = guild.channels.find("type", "text");
            }else{
                for(let i = 0; i < server.discordChannels.length; i++){
                    channels.push(guild.channels.find("name", server.discordChannels[i]));
                }
            }
            var embed = new Discord.RichEmbed()
                        .setColor("#9689b9")
                        .setTitle(res.stream.channel.display_name.replace(/_/g, "\\_"))
                        .setURL(res.stream.channel.url)
                        .setDescription("**" + res.stream.channel.status +
                                        "**\n" + res.stream.game)
                        .setImage(res.stream.preview.large)
                        .setThumbnail(res.stream.channel.logo)
                        .addField("Зрителей", res.stream.viewers, true)
                        .addField("Фолловеров", res.stream.channel.followers, true);

            if(channels.length !== 0){
                for(let i = 0; i < channels.length; i++){
                    channels[i].sendEmbed(embed).then(
                        print("Sent embed to channel '" + channels[i].name +
                              "'."));
                }
                twitchChannel.online = true;
                twitchChannel.timestamp = Date.now();
            }else if(defaultChannel){
                defaultChannel.sendEmbed(embed).then(
                    print("Sent embed to channel '" + defaultChannel.name +
                          "'.")
                );
                twitchChannel.online = true;
                twitchChannel.timestamp = Date.now();
            }
        }
        catch(err){
            print(err);
        }
    }else if(res.stream === null){
        twitchChannel.online = false;
    }
}

function tick(){
    for(let i = 0; i < servers.length; i++){
        for(let j = 0; j < servers[i].twitchChannels.length; j++){
            for(let k = -1; k < servers[i].discordChannels.length; k++){
                if(servers[i].twitchChannels[j]){
                    callApi(servers[i], servers[i].twitchChannels[j], apiCallback, true);
                }
            }
        }
    }
}


bot.on("message", (message)=>{
    var server, twitchChannels;
    if(!message.guild){
        return;

    }else{
        let index = indexOfObjectByName(servers, message.guild.name);
        if(index == -1){
            servers.push({name: message.guild.name,
                          lastPrefix: "!adasdsa", prefix: "/",
                          role: "Сорок Седьмые", discordChannels: [],
                          twitchChannels: []});
            index = servers.length - 1;
        }

        server =  servers[index];
        twitchChannels = servers[index].twitchChannels;
    }

    if(message.content[0] == server.prefix){
        var permission;
        try {
            permission = message.member.roles.exists("name", server.role);
        }
        catch(err){
            print("Роли "+server.role + " нет на этом сервере.", err);
        }

        let index;
        var streamer;
        if(message.content.substring(1, 7) == "remove"){
            if(permission){
                streamer = message.content.slice(7).trim();
                index = indexOfObjectByName(twitchChannels, streamer);
                if(index != -1){
                    twitchChannels.splice(index, 1);
                    index = indexOfObjectByName(twitchChannels, streamer);
                    if(index == -1){
                        message.reply("Удален " + streamer + ".");
                    }else{
                        message.reply(streamer + " нет в списке.");
                    }
                }else{
                    message.reply(streamer + " нет в списке.");
                }
            }else{
                message.reply("у тебя нет роли _" + server.role + "_.");
            }

        }else if(message.content.substring(1, 4) == "add"){
            if(permission){
                streamer = message.content.slice(4).trim();
                var channelObject = {name: streamer};
                index = indexOfObjectByName(twitchChannels, streamer);
                callApi(server, channelObject, (serv, chan, res)=>{
                    if(index != -1){
                        message.reply(streamer + " уже в списке.");
                    }else if(res){
                        twitchChannels.push({name: streamer, timestamp: 0,
                                             online: false});
                        message.reply("Добавлен " + streamer + ".");
                        tick();
                    }else{
                        message.reply("Стримера "+streamer + " не существует.");
                    }
                }, false);
            }else{
                message.reply("У тебя нет роли _" + server.role + "_.");
            }

        }else if(message.content.substring(1, 5) == "list"){
            let msg = "\n";
            for(let i = 0; i < twitchChannels.length; i++){
                var streamStatus;
                if(twitchChannels[i].online){
                    msg += "**" + twitchChannels[i].name + " online**\n";
                }else{
                    streamStatus = "offline";
                    msg += twitchChannels[i].name + " offline\n";
                }
            }
            if(!msg){
                message.reply("The list is empty.");
            }else{
                message.reply(msg.replace(/_/g, "\\_"));
            }

        }else if(message.content.substring(1,10) == "configure"){
            let msg = "";
            if(message.guild.owner == message.member){
                if(message.content.substring(11, 15) == "list"){
                    msg += "```\n" +
                           "prefix    " + server.prefix + "\n" +
                           "role      " + server.role + "\n";

                    msg += "channels  " + server.discordChannels[0];
                    if(server.discordChannels.length > 1){
                        msg += ",";
                    }
                    msg += "\n";

                    for(let i = 1; i < server.discordChannels.length; i++){
                        msg += "          " + server.discordChannels[i];
                        if(i != server.discordChannels.length -1){
                            msg += ",";
                        }
                        msg += "\n";
                    }
                    msg += "```";

                }else if(message.content.substring(11, 17) == "prefix"){
                    let newPrefix = message.content.substring(18, 19);
                    if(newPrefix.replace(/\s/g, '').length === 0){
                        msg += "Please specify an argument";
                    }else if(newPrefix == server.prefix){
                        msg += "Prefix already is " + server.prefix;
                    }else{
                        server.lastPrefix = server.prefix;
                        server.prefix = newPrefix;
                        msg += "Changed prefix to " + server.prefix;
                    }

                }else if(message.content.substring(11, 15) == "role"){
                    if(message.content.substring(16).replace(/\s/g, '').length === 0){
                        msg += "Ошибка";
                    }else{
                        server.role = message.content.substring(16);
                        msg += "Роль изменена на " + server.role;
                    }

                }else if(message.content.substring(11, 18) == "channel"){
                    if(message.content.substring(19, 22) == "add"){
                        let channel = message.content.substring(23);
                        if(channel.replace(/\s/g, '').length === 0){
                            msg += "напиши имя канала";
                        }else if(message.guild.channels.exists("name", channel)){
                            server.discordChannels.push(channel);
                            msg += "Добавлен " + channel + " в список стримеров.";
                        }else{
                            msg += channel + " нет в списке.";
                        }

                    }else if(message.content.substring(19, 25) == "remove"){
                        for(let i = server.discordChannels.length; i >= 0; i--){
                            let channel = message.content.substring(26);
                            if(channel.replace(/\s/g, '').length === 0){
                                msg = "напиши имя канала";
                                break;
                            }else if(server.discordChannels[i] == channel){
                                server.discordChannels.splice(i, 1);
                                msg = "Удален " + channel + " из списка стримеров.";
                                break;
                            }else{
                                msg = channel + " нет в списке.";
                            }
                        }
                    }else{
                        msg = "Ошибка";
                    }

                }else{
                    msg += "```\n" +
                           "Использование: " + server.prefix + "configure OPTION [SUBOPTION] VALUE\n" +
                           "Example: " + server.prefix + "configure channel add example\n" +
                           "\nOptions:\n" +
                           "  list        List current config\n" +
                           "  prefix      Character to use in front of commands\n" +
                           "  role        Role permitting usage of add and remove\n" +
                           "  channel     Channel(s) to post in, empty list will use the first channel\n" +
                           "      добавь         Add a discord channel to the list\n" +
                           "      remove      Remove a discord channel from the list\n" +
                           "```";
                }

            }else{
                msg += "Ты не владелец сервера.";
            }
            message.reply(msg);

        }else{
            message.reply("Использование:\n" + server.prefix +
                               "add имя_канала|remove имя_канала]");
        }
    }else if(message.content[0] == server.lastPrefix){
        message.reply("The prefix was changed from `" + server.lastPrefix +
                      "` to `" + server.prefix +
                      "`. Please use the new prefix.");
    }
});


bot.login(token).then((token)=>{
    if(token){
        print("Logged in with token " + token);
        print("Reading file " + channelPath);
        var file = fs.readFileSync(channelPath, {encoding:"utf-8"});
        servers = JSON.parse(file);

        // tick once on startup
        tick();
        setInterval(tick, interval);
    }else{
        print("An error occured while loging in:", err);
        process.exit(1);
    }
});
