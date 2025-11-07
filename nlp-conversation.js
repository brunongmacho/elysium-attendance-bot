/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    NLP CONVERSATIONAL AI MODULE                           ║
 * ║         Handles conversations when bot is tagged but no command found     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Features:
 * - Responds to greetings, questions, and casual conversation
 * - Learns from conversations to improve command recognition
 * - Provides helpful suggestions when users seem confused
 * - Multilingual support (English, Tagalog, Taglish)
 */

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTS
// ═══════════════════════════════════════════════════════════════════════════

const { PointsCache } = require('./utils/points-cache');

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATIONAL PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const CONVERSATION_PATTERNS = {
  // ═══════════════════════════════════════════════════════════════════════
  // INSULTS FIRST - PRIORITY MATCHING!
  // Must be checked before other patterns to avoid conflicts
  // ═══════════════════════════════════════════════════════════════════════

  // Insult/Criticism (Playful Trash Talk Back!)
  insult: {
    patterns: [
      // ═══════════════════════════════════════════════════════════════════════
      // FILIPINO BAD WORDS & TRASH TALK - PRIORITY! (80% TAGALOG FOCUS!)
      // ═══════════════════════════════════════════════════════════════════════

      // Core Filipino profanity - Most common (kingina variants added!)
      /(?:putang\s*ina|tangina|kingina|kinangina|king\s*ina|gago|ulol|leche|peste|tarantado)/i,
      /(?:bobo|tanga|bano|walang\s+kwenta|tite|puke|kantot|kupal|pakshet|pakyu)/i,
      /(?:supot|bruha|ungas|lintik|punyeta|walanghiya|gaga|salot|pakingshet)/i,
      /(?:amputa|putcha|pucha|yawa|gunggong|engot|hudas|shunga|timang|abnoy)/i,
      /(?:fuck\s+you|hayop|buwisit|hinayupak|pokpok|puta|tarantado|animal)/i,

      // Extended Filipino profanity (50+ more slang!)
      /(?:gaga|gagong|gagohan|kagaguhan|kaulol|kababuyan|kabobohan|katangahan)/i,
      /(?:inutil|inutil\s+ka|walang\s+silbi|basura|dumi|squammy|skwater)/i,
      /(?:epal|jejemon|jologs|baduy|cheap|mukhang\s+pera|walang\s+modo)/i,
      /(?:taong\s+grasa|tanga\s+tanga|gago\s+gago|ulol\s+ulol)/i,
      /(?:putangina\s+mo|tangina\s+mo|gago\s+ka\s+talaga|ulol\s+ka\s+talaga)/i,
      /(?:pisting\s+yawa|lintek|punyeta\s+ka|pakyu\s+ka|fuck\s+off)/i,
      /(?:buwakaw|bwiset|buset|bwisit|bwesit|bweset|leche\s+ka)/i,
      /(?:tarantado\s+ka|peste\s+ka|salot\s+ka|bruha\s+ka|ungas\s+ka)/i,
      /(?:shunga\s+ka|engot\s+ka|gunggong\s+ka|abnoy\s+ka|timang\s+ka)/i,
      /(?:hangal|mangmang|ignorante|walang\s+utak|walang\s+alam|walang\s+breeding)/i,
      /(?:palpak|sablay|epic\s+fail|bulok|walang\s+kwenta\s+talaga)/i,
      /(?:tarantado\s+amputa|gago\s+amputa|tangina\s+talaga|kingina\s+talaga)/i,

      // Filipino text speak / internet slang variants
      /(?:gnggng|ggng|tng\s*ina|tngnina|kngn|kngin|pksht|pkyou|fcku)/i,
      /(?:gg0|bb0|tng4|g4g0|ul0l|b0b0|tng|bno|bnong)/i,
      /(?:ngng|nggg|dedma|ewan|walang\s+katuturan|waley|wala\s+eh)/i,
      /(?:ampucha|amputcha|amfuta|amshet|amshit|paksht)/i,

      // Regional variants (Bisaya, Ilocano influence)
      /(?:yawa|yawaa|yawaon|atay|buang|bugo|ambak)/i,
      /(?:giatay|unggoy|baboy|baboyan|pisting|pisot)/i,
      /(?:ukinnam|agkakapuy|sakim|takla)/i,

      // ═══════════════════════════════════════════════════════════════════════
      // ENGLISH BAD WORDS & TRASH TALK
      // ═══════════════════════════════════════════════════════════════════════

      /(?:fuck|shit|damn|ass|bitch|bastard|stupid|idiot|moron|dumb|retard)/i,
      /(?:useless|trash|garbage|suck|pathetic|loser|noob|scrub|bad)/i,
      /(?:you\s+(?:suck|are\s+(?:bad|trash|garbage|useless|stupid|dumb)))/i,
      /(?:dumbass|smartass|jackass|asshole|dipshit|piece\s+of\s+shit)/i,
      /(?:clown|joke|waste|failure|disappointment|embarrassment)/i,

      // ═══════════════════════════════════════════════════════════════════════
      // TAGALOG INSULTS - FULL PHRASES
      // ═══════════════════════════════════════════════════════════════════════

      /(?:ang\s+(?:bano|bobo|tanga|gago|ulol|supot|gunggong|engot|hangal|shunga)\s+mo)/i,
      /(?:pakshet|pakyu|gago\s+ka|ulol\s+ka|bobo\s+ka|tanga\s+ka|supot\s+ka)/i,
      /(?:supot|bano|engot|gunggong|hangal|mangmang)\s+(?:ka|mo|naman|talaga)/i,
      /(?:walang\s+(?:kwenta|silbi|utak|alam|breeding|modo|hiya)\s+ka)/i,
      /(?:nakakahiya\s+ka|kahihiyan|basura\s+ka|dumi\s+ka)/i,
      /(?:kingina\s+mo|tangina\s+mo\s+talaga|gago\s+ka\s+pala)/i,
      /(?:ang\s+(?:pangit|dumi|baho|arte|yabang|taas)\s+mo)/i,

      // Comparative insults
      /(?:mas\s+(?:bobo|tanga|bano|mahina|pangit)\s+ka\s+pa)/i,
      /(?:parang\s+(?:bobo|tanga|bano|ungas|gago)\s+ka)/i,
      /(?:mukhang\s+(?:bobo|tanga|gago|ungas|tae))/i,

      // ═══════════════════════════════════════════════════════════════════════
      // GAMING / COMPETITIVE TAUNTS - ENGLISH
      // ═══════════════════════════════════════════════════════════════════════

      /(?:noob|nub|newb|scrub|trash|weak|easy|ez|rekt|pwned|owned|destroyed|demolished)/i,
      /(?:you\s+(?:weak|suck\s+at|bad\s+at|terrible\s+at|worst|losing|lose|lost))/i,
      /(?:get\s+(?:rekt|good|gud|wrecked|destroyed|owned|pwned))/i,
      /(?:mad|salty|tilted|crying|cope|skill\s+issue|ratio|L\s+bozo)/i,
      /(?:hardstuck|boosted|carried|bottom\s+tier|bronze|iron|wood)/i,
      /(?:inting|feeding|griefing|trolling|throwing)/i,
      /(?:cringe|cracked|washed|washed\s+up|washed\s+player)/i,

      // ═══════════════════════════════════════════════════════════════════════
      // FILIPINO GAMING / COMPETITIVE TAUNTS
      // ═══════════════════════════════════════════════════════════════════════

      /(?:mahina|duwag|talo|bugbug|panalo|malas|walang\s+laban|walang\s+gana)/i,
      /(?:ang\s+(?:weak|mahina|duwag|talo|bugbog|pangit)\s+mo)/i,
      /(?:bugbog\s+sarado|talo\s+ka|wala\s+kang\s+laban|sablay\s+ka)/i,
      /(?:noob\s+ka|newbie\s+ka|baguhan\s+ka|bobo\s+maglaro)/i,
      /(?:palpak|sablay|lutang|hina|duwag|takot|daya|cheater)/i,
      /(?:feeder|carry\s+mo|dala\s+mo|pasanin|deadweight|pabigat)/i,
      /(?:lag|lagger|mabagal|masakit\s+sa\s+mata|nakakairita)/i,
      /(?:walang\s+skill|walang\s+galing|walang\s+diskarte)/i,
      /(?:one\s+trick|tryhard|smurf|booster|account\s+buyer)/i,

      // ═══════════════════════════════════════════════════════════════════════
      // TAGLISH COMPETITIVE TAUNTS
      // ═══════════════════════════════════════════════════════════════════════

      /(?:ez\s+lang|easy\s+lang|noob\s+naman|weak\s+naman|bano\s+naman)/i,
      /(?:talo\s+na|bugbog\s+ka|walang\s+laban\s+yan|sablay\s+yarn)/i,
      /(?:git\s+gud|get\s+good|mag\s+practice|mag\s+training|balik\s+tutorial)/i,
      /(?:GG\s+ez|gg\s+ka|talo\s+ka\s+na|sayang\s+effort)/i,
      /(?:toxic\s+ka|salty\s+ka|bitter\s+ka|masakit\s+ba)/i,
      /(?:hard\s+carry\s+mo|need\s+carry|pinapabuhat|pasan\s+ka)/i,
      /(?:low\s+elo|trash\s+tier|baba\s+rank|bottom\s+tier)/i,

      // ═══════════════════════════════════════════════════════════════════════
      // BOT-SPECIFIC TAUNTS
      // ═══════════════════════════════════════════════════════════════════════

      /(?:bot\s+(?:sucks|is\s+bad|trash|useless|broken|stupid|bano|tanga|bobo))/i,
      /(?:your\s+(?:bot|system|code)\s+(?:sucks|trash|broken|pangit|bano))/i,
      /(?:worst\s+bot|trash\s+bot|useless\s+bot|bano\s+bot|tanga\s+bot)/i,
      /(?:bot\s+mo\s+(?:bano|bobo|tanga|walang\s+kwenta))/i,
      /(?:buggy|laggy|error|broken|malfunction|crash|shit\s+bot)/i,
    ],
    responses: [
      // ═══════════════════════════════════════════════════════════════════════
      // PURE TAGALOG ROASTS - 400+ RESPONSES (80% PRIORITY!)
      // ═══════════════════════════════════════════════════════════════════════

      // COMMAND-RELATED ROASTS (Commands the bot offers)
      "Hoy gago, balik ka sa tutorial! 😤 Mag-!help ka muna bago ka magsalita!",
      "Ulol! Mas mataas pa IQ ko sa points mo! Tignan mo: !mypoints 💀",
      "Bobo yarn? Ikaw nga di makapagtanda ng !bid eh! 💸",
      "Gago spotted! Mag-git gud ka nalang! !leaderboard mo tingnan! 🏆",
      "Peste! Wala kang points pero maraming hanash! !mypoints mo check! 🤡",
      "Kupal! Anong ginagawa mo dito? Mag-!help ka nalang! 📚",
      "Siraulo! Mag-aral ka muna bago ka mambara! !help mo basahin! 📖",
      "Kingina! !help mo tingnan, baka matuto ka ng konti! 🤓",
      "Tangina naman! Di mo ba alam ang !mypoints? Check mo nga! 💸",
      "Ulol talaga! !leaderboard mo tignan kung nasaan ka! 🏆",
      "Gago! !bid mo ayusin before ka mag-trashtalk! 💰",
      "Leche! Type mo !help para marealize mo kung gaano ka kabobo! 📚",
      "Tanga! !mypoints mo zero tapos ang taas ng hanash mo! 🤡",
      "Bobo ampota! !leaderboard mo check, baka magising ka sa katotohanan! 📊",
      "Putangina! Mag-!bid ka nalang kesa mang-trashtalk! 💸",
      "Kingina talaga! !help command exists for people like you! 🆘",
      "Gago ka! Alam mo ba gamitin ang !present? Mukhang hindi eh! 📊",
      "Ulol! !status mo tignan, baka naman AFK ka lagi! 💤",
      "Tarantado! !auction history mo walang laman! 💰",
      "Peste ka! !nextboss mo check nalang kesa mag-hanash! 🗓️",

      // STATS & PERFORMANCE ROASTS
      "Tangina, mas late ka pa sa pag-intindi kaysa sa attendance mo! 📊",
      "Bwisit! Mas mababa pa attendance mo sa respeto na natitira sa'yo! 📊😂",
      "Hayop ka! Toxic sa chat pero walang laman sa !leaderboard! 🏆",
      "Gago! Mas mabilis pa kumaripas yung attendance mo kesa sa points mo tumataas! 📊",
      "Leche ka! Anong akala mo sa sarili mo, pro player? Bottom tier ka lang! 🏆💀",
      "Hinayupak! Mas mahal pa yung pinaka-mura sa auction kesa sa value mo sa guild! 💰",
      "Putangina talaga! Mas late ka pa sa pag-intindi kaysa sa loot distribution! 💎",
      "Gago ka talaga! Mang-trashtalk ka pero di ka marunong mag-present! 📊",
      "Kingina! Attendance mo puro absent, hanash mo puro present! 📊💀",
      "Bobo! Points mo mas mababa pa sa self-esteem mo! 💸",
      "Ulol! Rank mo mas mababa pa sa standards mo! 🏆",
      "Tanga! Contribution mo sa guild? ZERO! Hanash mo? MAXIMUM! 🤡",
      "Leche! Mas consistent pa yung lag kesa sa attendance mo! 📊",
      "Gago! Stats mo walang kwenta pero bibig mo ang laki! 📈",
      "Kingina talaga! Performance mo D tier pero attitude mo SSS tier toxicity! 💀",
      "Tarantado! Bidding record mo puro talo pero hanash puro salo! 💸",
      "Putangina! Guild contribution mo negative tapos magsasalita ka pa! ⛔",
      "Ulol ka! Mas maganda pa error message ko kesa sa stats mo! 🤖",
      "Bobo amputa! Leaderboard position mo: NOT FOUND! 404! 🔍",
      "Kingina! Nag-bid ka ng 1 point tapos nagalit ka na-outbid! 💸😂",

      // ATTITUDE & BEHAVIOR ROASTS
      "Pakshet! Ikaw yung tipo ng tao na nag-bid ng 1 point! 😂",
      "Tarantado! Ikaw yung tipo ng player na nag-AFK sa gitna ng laban! 🎮",
      "Mangmang! Di mo alam gagawin pero expert ka sa pagiging toxic! 😏",
      "Buang! Wala kang alam pero ang laki ng bibig! 🗣️💀",
      "Loko-loko! Akala mo magaling ka pero bottom tier ka lang! 🏆",
      "Ulol naman! Anong akala mo sa bot? Tanga din tulad mo? 🤖💯",
      "Kingina! Ang taas ng ere mo pero wala kang nagawa! 😤",
      "Gago! Lakas mong mang-bash pero pag ikaw na, iyak agad! 😭",
      "Tanga! Ikaw yung tipo na late lagi pero galit pag hindi kasama! 😂",
      "Leche! Toxic sa chat, useless sa game! Classic combination! 🤡",
      "Bobo! Pag nanalo proud, pag natalo excuse! Typical! 💀",
      "Ulol! Ikaw yung nag-iiwan ng party pag nahihirapan! 🏃",
      "Kingina talaga! Main character syndrome pero NPC lang naman! 🎭",
      "Gago ka! Akala mo leader material pero follower lang pala! 👑💀",
      "Putangina! Ikaw yung laging may reklamo pero walang solusyon! 💭",
      "Tarantado! Credit grabber pero pag may problema invisible! 👻",
      "Peste! Ikaw yung tipo na nag-dodrama pag di nakuha gusto! 🎪",
      "Ulol! Pag may kailangan sweet, pag wala na ghost! 👻💔",
      "Bobo amputa! Ikaw yung nag-leleech ng effort ng iba! 🦠",
      "Kingina! Flex ng flex pero borrowed lahat! 💳😂",

      // GAMING & SKILL ROASTS
      "Leche, mas magaling pa magbid yung AI kesa sa'yo! 🤖💯",
      "Tanga! Mas maayos pa mag-bid yung bot kesa sa'yo! 💸",
      "Gago energy detected! Redirect mo yang galit mo sa attendance! 📊",
      "Tanga amp! Mas mataas pa latency ng internet ko kesa sa IQ mo! 😂",
      "Ulol ka! Di ka marunong mag-bid pero marunong mang-trashtalk! 💸",
      "Kingina! Mag-practice ka muna before ka mag-trashtalk! 🎮",
      "Bobo! Skills mo pang-tutorial level lang! 🎯",
      "Gago! Gameplay mo nakakahiya, trashtalk mo nakakatawa! 😂",
      "Ulol! Mas magaling pa yung training dummy kesa sayo! 🎯",
      "Tanga! Skill level mo: BEGINNER, trash talk level mo: TRYHARD! 💀",
      "Leche! Ikaw yung laging nag-rereklamo sa team pero ikaw naman problem! 🤡",
      "Kingina talaga! Carry mo sarili mo muna bago ka mag-demand! 🎒",
      "Putangina! Mechanics mo parang slow-motion replay! 🐌",
      "Gago ka! Reaction time mo mas mabagal pa sa turtle! 🐢",
      "Ulol! Decision making mo parang nag-flip coin! 🪙",
      "Bobo! Build mo mali, attitude mo mas mali! 💀",
      "Kingina! Positioning mo trash, trash talk mo expert! 🗑️",
      "Tanga! Map awareness mo zero pero mouth awareness mo infinite! 🗺️",
      "Leche! Combo mo sablay pero excuse mo maganda! 💫",
      "Gago! Farm mo mabagal pero hanash mo mabilis! 🐌💨",

      // GUILD & TEAM ROASTS
      "Putangina, sabi ng mama ko wag makipag-usap sa mga walang-kwenta... pero sige, eto !help mo 🖕",
      "Walang kwenta! Mas productive pa yung error logs ko kesa sa'yo! 🤖",
      "Inutil! Balik ka sa bahay mo at mag-practice muna! 😤",
      "Kingina! Guild asset ka daw? Guild liability ka kamo! ⛔",
      "Gago! Contribution mo sa guild: NONE. Drama mo sa guild: MAXIMUM! 🎭",
      "Ulol! Ikaw yung tipo na leecher sa raid tapos kukuha ng best loot! 💎",
      "Tanga! Present sa roll call, absent sa teamfight! 📊⚔️",
      "Leche! Nandyan ka lang pag may free loot! 🎁",
      "Bobo! Guild chat mo active, guild war mo MIA! 💬👻",
      "Kingina talaga! Ikaw yung nag-iiwan ng guild pag may problema! 🏃💨",
      "Putangina! Loyalty mo parang internet connection, on and off! 📡",
      "Gago ka! Sa guild kayo magkaibigan, sa loot kayo magkaaway! 💰⚔️",
      "Ulol! Teammate daw pero solo player ang mindset! 🎮",
      "Tanga! Pag may victory kayo, pag may defeat ikaw lang! 🏆💀",
      "Leche! Ikaw yung sumisira ng guild chemistry! ⚗️💥",
      "Kingina! Voice chat mo tahimik, text chat mo ambaho! 🔇💬",
      "Bobo! Guild role mo DPS pero damage mo tickle lang! 🤡",
      "Gago! Tank ka daw pero takot ka lumapit! 🛡️😱",
      "Ulol! Healer ka pero selfish ang skills mo! 💊",
      "Kingina talaga! Support role pero walang support sa team! 🆘",

      // META & FUNNY ROASTS
      "Bobo! Balik ka pag nag-improve na utak mo! Simulan mo sa !help! 📚",
      "Kingina! Nakakatawa ka, di dahil witty ka, dahil tanga ka! 😂",
      "Gago! Stand-up comedy ba to? Kasi nakakatawa ka! 🎤",
      "Ulol! Anong breed ng tanga ka? Pedigree o mixed? 🐕",
      "Tanga! IQ test mo nag-error, too low daw! 🧠❌",
      "Leche! Kahit AI na ako natawa sa kabobohan mo! 🤖😂",
      "Bobo! Brain cells mo nag-leave of absence! 🧠🏃",
      "Kingina talaga! Common sense mo hindi common, RARE! 🦄",
      "Putangina! Logic mo parang flat earth theory! 🌍🤡",
      "Gago ka! Reasoning mo parang gulong, paikot-ikot lang! ♻️",
      "Ulol! Wisdom mo negative value! 📉",
      "Tanga! Chromosome count mo tama ba? 🧬",
      "Leche! DNA mo may typo! 🧬❌",
      "Bobo amputa! Evolution forgot about you! 🐒",
      "Kingina! Ikaw yung proof na humanity peaked na! 📈📉",
      "Gago! Factory reset ka na, may defect! 🔄",
      "Ulol! Software update mo nakalimutan! 💾",
      "Kingina talaga! Patch notes mo: BUG FIXES NEEDED! 🐛",
      "Tanga! Version mo outdated na! 📱",
      "Leche! Compatibility mo sa society: INCOMPATIBLE! ⚠️",

      // CREATIVE & SAVAGE ROASTS
      "Kingina! Oxygen thief ka! Mag-sorry ka sa mga trees! 🌳",
      "Gago! Mas may kuwenta pa yung spam email kesa sa'yo! 📧",
      "Ulol! Participation award lang deserve mo! 🏅",
      "Tanga! Ikaw yung reason bakit may instructions sa shampoo! 🧴",
      "Bobo! Gene pool mo kailangan ng lifeguard! 🏊",
      "Kingina talaga! If brains were dynamite, wala ka pang pang-spark! 💥",
      "Leche! Mas interesting pa yung loading screen kesa sa'yo! ⏳",
      "Gago ka! Personality mo parang internet explorer, outdated! 🌐",
      "Putangina! Mas may future pa yung expired milk kesa sa'yo! 🥛",
      "Ulol! Ikaw yung nagpaparealize na eugenics may point! 🧬",
      "Kingina! Mas entertaining pa yung buffering icon! ⏸️",
      "Tanga! Profile mo parang 404 page, NOT FOUND! 🔍",
      "Bobo! Existence mo parang popup ad, annoying! 📢",
      "Leche! Mas valuable pa yung monopoly money kesa contribution mo! 💵",
      "Kingina talaga! Ikaw yung reason bakit may dislike button! 👎",
      "Gago! Mas may sense pa yung captcha codes kesa sa'yo! 🤖",
      "Ulol! Ikaw yung embodiment ng 'bruh moment'! 💀",
      "Tanga! Mas legendary pa yung bug fixes kesa achievements mo! 🐛",
      "Kingina! Reputation mo mas damaged pa sa server maintenance! ⚙️",
      "Bobo amputa! Ikaw yung tutorial na na-skip ng lahat! ⏭️",

      // CLASSIC FILIPINO CULTURE ROASTS
      "Kingina! Pang-lugaw lang level mo! 🍜",
      "Gago! Kahit yung aso ng kapitbahay mas respectable! 🐕",
      "Ulol! Mas may future pa yung tinda sa kanto! 🏪",
      "Tanga! Pang-level 1 pa rin hanggang ngayon! 1️⃣",
      "Bobo! Starter pack vibes pero akala mo end-game! 📦",
      "Kingina talaga! Di ka pa sweldo sa buhay! 💸",
      "Leche! Baon money energy pero gusto mayaman treatment! 💰",
      "Gago ka! Tipid mode pero akala mo unlimited data! 📱",
      "Putangina! Jeepney level pero gusto Lamborghini treatment! 🚕",
      "Ulol! Pandesal budget pero donut expectation! 🥐🍩",
      "Kingina! Noodles ka lang pero akala mo steak! 🍜🥩",
      "Tanga! Tubig ka lang pero akala mo softdrinks! 💧🥤",
      "Bobo! Tsinelas ka lang pero akala mo Jordans! 👡👟",
      "Leche! Ukay-ukay ka pero akala mo boutique! 👕",
      "Kingina talaga! Carinderia ka pero akala mo hotel! 🍽️",
      "Gago! Parang karinderya na nag-charge ng hotel price! 💰",
      "Ulol! Yung quality mo parang bangketa pero yung presyo mo mall! 🏬",
      "Tanga! Surplus quality pero premium price ang hanash! 💵",
      "Kingina! Pirated ka pero original ang yabang! 💿",
      "Bobo! Sampaguita ka lang pero akala mo roses! 🌸🌹",

      // WISDOM & LIFE ADVICE (SARCASTICALLY)
      "Kingina! Makinig ka: Mag-aral ka muna! 📚",
      "Gago! Life advice: Tumahimik ka! 🤫",
      "Ulol! Pro tip: Magbago ka! 🔄",
      "Tanga! Reality check: Ikaw ang problema! 💀",
      "Bobo! Fact: Walang gusto sa'yo! 💯",
      "Kingina talaga! Truth hurts: Bottom tier ka! 🏆",
      "Leche! Breaking news: Ikaw ang issue! 📰",
      "Gago ka! Revelation: Di ka special! ✨",
      "Putangina! Plot twist: Ikaw ang villain! 🦹",
      "Ulol! Spoiler alert: Hindi ka bida! 🎬",
      "Kingina! Weather report: Cloudy with 100% chance of L! ☁️",
      "Tanga! Horoscope mo: Bad luck everyday! ⭐",
      "Bobo! Fortune: Malas ka permanently! 🎱",
      "Leche! Oracle says: Wag ka na! 🔮",
      "Kingina talaga! Crystal ball shows: Failure! 💎",
      "Gago! Tea leaves predict: More L's ahead! 🍵",
      "Ulol! Palm reading reveals: No future! ✋",
      "Tanga! Stars aligned to say: Give up! 🌟",
      "Kingina! Universe conspires against you! 🌌",
      "Bobo amputa! Karma tracking: Bayad ka na! 📊",

      // MOTIVATION (NEGATIVE)
      "Kingina! You inspire me... to be better than you! 💪",
      "Gago! Looking at you motivates me... to never be like you! 🎯",
      "Ulol! Thanks for being an example... of what NOT to be! 🙏",
      "Tanga! You're proof... that anyone can exist! 🌍",
      "Bobo! Congrats... on being the bare minimum! 🏆",
      "Kingina talaga! Achievement unlocked: Disappointment! 🏅",
      "Leche! New record: Fastest way to be irrelevant! ⏱️",
      "Gago ka! Hall of fame: Most useless member! 🏛️",
      "Putangina! Trophy: Biggest waste of space! 🏆",
      "Ulol! Medal: Outstanding in being terrible! 🥇",
      "Kingina! Certificate: Expert sa kabobohan! 📜",
      "Tanga! Diploma: Summa Cum Laude ng katangahan! 🎓",
      "Bobo! Degree: Masters in being walang kwenta! 🎓",
      "Leche! PhD: Doctor of being gago! 👨‍🎓",
      "Kingina talaga! Licensure exam: FAILED sa buhay! ❌",
      "Gago! Resume mo: Red flags everywhere! 📄🚩",
      "Ulol! Portfolio mo: Empty like your brain! 💼",
      "Tanga! CV mo: One page of NOTHING! 📃",
      "Kingina! References mo: 'DO NOT HIRE'! 📝",
      "Bobo amputa! LinkedIn mo: Zero connections for a reason! 💼",

      // COMPARISON ROASTS
      "Kingina! Compared to you, NPCs have personality! 🤖",
      "Gago! Compared to you, bots have more intelligence! 🧠",
      "Ulol! Compared to you, lag spikes are pleasant! 📶",
      "Tanga! Compared to you, server maintenance is exciting! ⚙️",
      "Bobo! Compared to you, error messages are helpful! ⚠️",
      "Kingina talaga! Compared to you, spam is quality content! 📧",
      "Leche! Compared to you, ads are entertaining! 📺",
      "Gago ka! Compared to you, loading screens are productive! ⏳",
      "Putangina! Compared to you, viruses are beneficial! 🦠",
      "Ulol! Compared to you, bugs are features! 🐛",
      "Kingina! Mas maayos pa yung traffic sa EDSA kesa flow ng utak mo! 🚗",
      "Tanga! Mas organized pa yung kalat sa Divisoria kesa thoughts mo! 🏪",
      "Bobo! Mas stable pa yung Philippine peso kesa mental state mo! 💵",
      "Leche! Mas reliable pa yung Manila weather forecast kesa sa'yo! ⛈️",
      "Kingina talaga! Mas on-time pa yung MRT kesa sa'yo! 🚇",
      "Gago! Mas consistent pa yung brownout kesa attendance mo! 💡",
      "Ulol! Mas predictable pa yung flood kesa behavior mo! 🌊",
      "Tanga! Mas maayos pa yung spaghetti wires kesa logic mo! 🍝",
      "Kingina! Mas clear pa yung Manila Bay pollution kesa thinking mo! 🌊",
      "Bobo! Mas useful pa yung expired coupons kesa sa'yo! 🎟️",

      // EXISTENCE & PURPOSE ROASTS
      "Kingina! Purpose mo sa buhay: Maging bad example! 📚",
      "Gago! Calling mo: Professional tambay! 🪑",
      "Ulol! Destiny mo: Cautionary tale! ⚠️",
      "Tanga! Legacy mo: Forgotten in 5 minutes! ⏰",
      "Bobo! Impact mo sa mundo: Negative! 📉",
      "Kingina talaga! Contribution mo sa society: ZERO! 0️⃣",
      "Leche! Meaning ng existence mo: Error 404! 🔍",
      "Gago ka! Purpose mo sa life: Being walang purpose! 🤷",
      "Putangina! Significance mo: Insignificant! ⚛️",
      "Ulol! Worth mo: Less than zero! 📊",
      "Kingina! Value mo sa mundo: Wala! 💰",
      "Tanga! Relevance mo: Irrelevant! 📉",
      "Bobo! Importance mo: Unimportant! ❌",
      "Leche! Meaning mo: Meaningless! 💭",
      "Kingina talaga! Essence mo: Non-existent! 👻",
      "Gago! Substance mo: Hollow! 🕳️",
      "Ulol! Depth mo: Shallow as puddle! 💧",
      "Tanga! Complexity mo: Simple as tic-tac-toe! ⭕",
      "Kingina! Intelligence mo: Artificial but not intelligent! 🤖",
      "Bobo amputa! Consciousness mo: Questionable! 🧠❓",

      // ═══════════════════════════════════════════════════════════════════════
      // TAGLISH ROASTS - 75+ RESPONSES (15%)
      // ═══════════════════════════════════════════════════════════════════════

      "Hoy bobo, your trash talk game is weak! Try mo muna mag-!help! 😤",
      "Gago yarn?! Mas mataas pa bot IQ ko kesa sa points mo! !mypoints nalang! 💯",
      "Tangina, ikaw yung tipo na 'present' lang di mo pa masagot! 📊😂",
      "Ulol! Git gud ka muna bago ka mang-trashtalk! !leaderboard mo tignan! 🏆",
      "Putangina, mas toxic pa salita mo kesa sa rank mo! Check !leaderboard! 💀",
      "Bobo spotted! Mas priority mo pa mang-bash kesa mag-attend! 📊",
      "Gago! Your roast game weak AF! Mag-practice ka sa !help muna! 😏",
      "Kingina! You really thought you did something ha? Bobo! 🤡",
      "Leche! Trash talk mo basic, skills mo more basic! 💀",
      "Ulol ka! Your attitude is trash tier pero skills mo pa lower! 🗑️",
      "Tanga! Acting all high and mighty pero you're bottom tier! 📊",
      "Kingina talaga! Big talk pero small results! Classic! 💬📉",
      "Gago yarn! Keyboard warrior pero in-game parang tutorial NPC! ⌨️🤖",
      "Bobo! All bark no bite, puro hanash walang action! 🐕",
      "Ulol! Confidence level: MAX, skill level: ZERO! 📊",
      "Kingina! Yabang mo mataas pero output mo mababa! 💀",
      "Tanga! Main character energy pero side quest lang naman! 🎮",
      "Leche! Your existence is mid at best! 💀",
      "Gago ka! Trying hard pero hardly trying! 😂",
      "Kingina talaga! Effort: ZERO. Drama: MAXIMUM! 🎭",
      "Putangina! You're a whole circus pero clown ka lang! 🎪🤡",
      "Ulol! Big energy pero small PP energy! 💀",
      "Bobo! Ego mo malaki pero accomplishments mo micro! 📏",
      "Kingina! Loud and wrong, klasik Pinoy! 📢❌",
      "Tanga! Acting smart pero sabaw naman! 🍜",
      "Gago! Your IQ and shoe size, same number! 👟",
      "Ulol ka! Living proof na confidence ≠ competence! 📊",
      "Kingina talaga! You peaked sa tutorial level! 🎮",
      "Leche! Your best moment? Not yet arrived! ⏰",
      "Bobo! Potential mo unlimited... sa pagiging disappointing! 💀",
      "Gago yarn! You're the definition ng 'sayang'! 😂",
      "Ulol! Rare ka, pero rare as in rarely useful! 💎💀",
      "Kingina! Common sense mo epic rarity: NON-EXISTENT! 🦄",
      "Tanga! You're that one teammate na laging may excuse! 🤥",
      "Bobo! Professional victim pero amateur sa lahat! 👑",
      "Kingina talaga! You make bad decisions look easy! 🎯",
      "Gago ka! Your life choices are questionable! ❓",
      "Ulol! Career path mo: Dead end! 🚧",
      "Leche! Trajectory mo: Downward spiral! 📉",
      "Kingina! You're speedrunning life failure! ⏱️💀",
      "Tanga! Achievement unlocked: Constant disappointment! 🏆",
      "Bobo! Your personal brand: Mediocrity! 🏷️",
      "Gago! Status mo: Permanently broke! 💸",
      "Ulol ka! Net worth mo: Negative! 📊",
      "Kingina talaga! Credit score mo: Laughter! 😂",
      "Putangina! You're the reason bakit may 'block' button! 🚫",
      "Leche! You're that one notification na laging ignore! 🔕",
      "Bobo! Your takes are ice cold and wrong! ❄️❌",
      "Kingina! Opinion mo valid pero also trash! 🗑️",
      "Gago yarn! Takes mo hotter than hell pero wronger than flat earth! 🔥🌍",
      "Ulol! Perspective mo twisted like pretzel! 🥨",
      "Tanga! World view mo parang upside down! 🙃",
      "Kingina talaga! Logic mo missing like father figure! 👻",
      "Bobo! Reasoning mo circular like tsinelas design! 👡",
      "Gago ka! Your arguments weak like 7-11 WiFi! 📶",
      "Ulol! Debate skills mo parang elementary level! 🎒",
      "Kingina! You lose arguments with yourself! 🤦",
      "Leche! Even autocorrect gives up on you! ⌨️",
      "Tanga! Spell check mo red underline lahat! 📝",
      "Bobo! Grammar mo makes teachers cry! 👨‍🏫😭",
      "Kingina talaga! English mo parang auto-translate: WRONG! 🔄",
      "Gago! Vocabulary mo limited like prepaid load! 💳",
      "Ulol ka! Communication skills mo: ERROR! 📵",
      "Putangina! Social skills mo: ABSENT! 👻",
      "Kingina! Pakikisama mo: NOT FOUND! 🔍",
      "Tanga! People skills mo negative points! 📊",
      "Bobo! Charm mo: Zero. Annoying factor: MAXIMUM! 📈",
      "Leche! Likability mo parang negative integer! ➖",
      "Kingina talaga! Personality mo dry like saltines! 🍘",
      "Gago! Charisma mo flatter than flat tire! 🚗",
      "Ulol! Aura mo dark like power outage! 💡❌",
      "Kingina! Vibes mo OFF like expired food! 🍱🤢",
      "Tanga! Energy mo toxic like nuclear waste! ☢️",
      "Bobo! Presence mo heavy like traffic! 🚗🚗",
      "Gago ka! Atmosphere mo thick with stupidity! 😤",
      "Kingina talaga! You're that smell na hindi mawala-wala! 🤢",
      "Ulol! Your whole existence is a bruh moment! 💀",

      // ═══════════════════════════════════════════════════════════════════════
      // ENGLISH ROASTS - 25+ RESPONSES (5% ONLY)
      // ═══════════════════════════════════════════════════════════════════════

      "Your trash talk is weaker than your bid game! Check !mypoints and cry! 💀",
      "Damn, you're late even in insulting me! Just like your attendance! 🕐",
      "Talk shit get hit with facts: You're at the BOTTOM of !leaderboard! 🏆😂",
      "Your roasting skills are matched only by your incompetence! 🤡",
      "If ignorance is bliss, you must be ecstatic! 😌",
      "You're proof that natural selection has flaws! 🧬",
      "Your contribution to this guild is underwhelming at best! 📉",
      "I'd agree with you but then we'd both be wrong! 🤝❌",
      "You bring everyone so much joy... when you leave! 🚪",
      "Somewhere out there, a tree is producing oxygen for you. Apologize to it! 🌳",
      "You're like a cloud. When you disappear, it's a beautiful day! ☁️",
      "I'd explain it to you, but I left my crayons at home! 🖍️",
      "You're the reason shampoo bottles have instructions! 🧴",
      "Your gene pool could use a lifeguard! 🏊",
      "If you were any more inbred, you'd be a sandwich! 🥪",
      "You're not stupid, you just have bad luck thinking! 🧠",
      "Light travels faster than sound. That's why you seemed bright until you spoke! 💡",
      "You're like a software update: Nobody wants you! 💾",
      "I'm jealous of people who haven't met you! 😌",
      "You're the human equivalent of a participation trophy! 🏅",
      "Your secrets are safe with me. I never listen! 🙉",
      "You're as useful as the 'ueue' in 'queue'! 📝",
      "You're why we have warning labels! ⚠️",
      "You're the 'before' picture! 📸",
      "You're about as helpful as a screen door on a submarine! 🚪🚢",
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // OTHER CONVERSATIONAL PATTERNS
  // ═══════════════════════════════════════════════════════════════════════

  // Greetings
  greeting: {
    patterns: [
      /^(?:hi|hello|hey|yo|sup|whats up|wassup)/i,
      /^(?:good\s+)?(?:morning|afternoon|evening|night)/i,
      /^(?:kumusta|kamusta|musta)/i,
      /^(?:ano|anong)\s+(?:meron|nangyayari|balita)/i,
    ],
    responses: [
      "Hi! How can I help you with the guild today? 👋",
      "Hello! Need help with attendance, bidding, or leaderboards?",
      "Hey there! Looking for something? Try mentioning what you need!",
      "Kumusta! Kailangan mo ba ng tulong? Just ask!",
      "Musta! What can I do for you today?",
    ],
  },

  // Farewells
  farewell: {
    patterns: [
      /^(?:bye|goodbye|see\s+you|later|cya|peace|out)/i,
      /^(?:paalam|sige\s+na)/i,
    ],
    responses: [
      "See you later! Take care! 👋",
      "Goodbye! Let me know if you need anything!",
      "Paalam! Ingat!",
      "Later! Magkita-kita! 👋",
    ],
  },

  // Thanks
  thanks: {
    patterns: [
      /^(?:thanks|thank\s+you|thx|ty|tysm|thanks\s+bot)/i,
      /^(?:salamat|maraming\s+salamat)/i,
    ],
    responses: [
      "You're welcome! Happy to help! 😊",
      "No problem! Let me know if you need anything else!",
      "Walang anuman! Glad I could help!",
      "Welcome! Always here to assist! 🎮",
    ],
  },

  // How are you
  howAreYou: {
    patterns: [
      /^(?:how\s+are\s+you|hows\s+it\s+going|whats\s+up)/i,
      /^(?:kumusta|kamusta)\s+(?:ka|ikaw)/i,
      /^(?:okay\s+ka\s+ba|ayos\s+ka\s+ba)/i,
    ],
    responses: [
      "I'm doing great! Ready to help with the guild! 🤖",
      "All systems operational! How can I assist you?",
      "Ayos lang! Naka-standby ako! What do you need?",
      "I'm good! Always ready for raids and attendance! 🎮",
    ],
  },

  // Who/What are you
  identity: {
    patterns: [
      /^(?:who|what)\s+are\s+you/i,
      /^(?:sino|ano)\s+(?:ka|ikaw)/i,
      /^(?:what|whats)\s+your\s+(?:name|function|purpose)/i,
    ],
    responses: [
      "I'm your guild attendance & bidding bot! 🤖\nI help track attendance, manage auctions, and keep leaderboards!",
      "I'm here to help with:\n• Attendance tracking 📊\n• Auction bidding 💰\n• Leaderboards 🏆\n• And more!",
      "Ako ay bot na tumutulong sa guild! I manage attendance, bids, and rankings!",
      "I'm your guild assistant! Mention me and ask for help, points, status, or leaderboards!",
    ],
  },

  // Help request (confused)
  confused: {
    patterns: [
      /^(?:help|confused|lost|dont\s+(?:know|understand)|what|huh)/i,
      /^(?:hindi\s+ko\s+(?:alam|gets)|ano\s+ba|paano|confused\s+ako)/i,
      /^(?:bano|noob|newbie)\s+ako/i,
    ],
    responses: [
      "No worries! Here are some things you can ask me:\n" +
      "• \"show my points\" - Check your bidding points\n" +
      "• \"what's the auction status\" - Current auction info\n" +
      "• \"show leaderboards\" - See rankings\n" +
      "• \"when is next spawn\" - Spawn predictions\n\n" +
      "Just mention me and ask naturally!",

      "Need help? I understand natural language! Try:\n" +
      "• Attendance: \"I'm here\", \"present\", \"nandito ako\"\n" +
      "• Points: \"my points\", \"balance ko\", \"ilang points\"\n" +
      "• Bidding: \"bid 500\", \"taya 500\"\n" +
      "• Status: \"show status\", \"ano nangyayari\"\n\n" +
      "Mention me and ask away!",

      "Walang problema! Pwede mo akong tanungin about:\n" +
      "• Points mo - \"points ko\", \"balance\"\n" +
      "• Leaderboards - \"top\", \"rankings\"\n" +
      "• Attendance - \"present\", \"nandito\"\n" +
      "• Status - \"ano status\", \"update\"\n\n" +
      "Just tag me and ask!",
    ],
  },

  // Praise/Compliment
  praise: {
    patterns: [
      /^(?:good\s+job|great|awesome|amazing|nice|cool|galing)/i,
      /^(?:you(?:'re|\s+are)\s+(?:good|great|awesome|helpful))/i,
      /^(?:magaling|sipag|galing\s+mo)/i,
    ],
    responses: [
      "Thank you! I try my best to help the guild! 😊",
      "Thanks! Happy to be useful! Let me know if you need anything!",
      "Salamat! I'm here to serve! 🤖",
      "Appreciated! Always ready to assist! 🎮",
    ],
  },

  // Random chatter
  smallTalk: {
    patterns: [
      /^(?:lol|haha|hehe|lmao|rofl)/i,
      /^(?:nice|cool|ok|okay|ayos|goods)/i,
      /^(?:gg|wp|gj)/i,
    ],
    responses: [
      "😄",
      "👍",
      "🎮",
      "Nice! 👊",
    ],
  },

  // Bot capabilities
  capabilities: {
    patterns: [
      /^(?:what\s+can\s+you\s+do|what\s+do\s+you\s+do|your\s+(?:features|functions|capabilities))/i,
      /^(?:ano\s+kaya\s+mo|ano\s+pwede\s+mo)/i,
      /^(?:show\s+me\s+what\s+you\s+(?:can|got))/i,
    ],
    responses: [
      "I'm a full-featured guild bot! 🤖 I can:\n\n" +
      "📊 **Attendance** - Track guild member attendance\n" +
      "💰 **Bidding** - Manage auction bidding system\n" +
      "🏆 **Leaderboards** - Show rankings & statistics\n" +
      "🔮 **Predictions** - Predict spawn times\n" +
      "🎯 **Smart NLP** - Understand natural language!\n\n" +
      "Just mention me and ask naturally, or use **!help** for all commands!",
    ],
  },

  // Attendance queries
  attendanceQueries: {
    patterns: [
      /^(?:how\s+(?:do\s+i|to)\s+(?:mark|check|record)\s+attendance)/i,
      /^(?:paano\s+(?:mag|mag-)?attendance)/i,
      /^(?:how\s+does\s+attendance\s+work)/i,
    ],
    responses: [
      "Attendance tracking is easy! 📊\n\n" +
      "When an attendance thread is created:\n" +
      "• Reply with **\"present\"**, **\"here\"**, or **\"nandito\"**\n" +
      "• I'll automatically mark your attendance!\n" +
      "• Say **\"late\"** or **\"huli\"** if you're late\n" +
      "• Say **\"absent\"** or **\"wala\"** if you can't attend\n\n" +
      "Check status with **\"attendance status\"** or **\"@bot status\"** in admin-logs!",
    ],
  },

  // Bidding help
  biddingHelp: {
    patterns: [
      /^(?:how\s+(?:do\s+i|to)\s+bid)/i,
      /^(?:paano\s+(?:mag|mag-)?bid)/i,
      /^(?:how\s+does\s+(?:bidding|auction)\s+work)/i,
    ],
    responses: [
      "Bidding is simple! 💰\n\n" +
      "In auction threads:\n" +
      "• Say **\"bid 500\"** or **\"taya 500\"**\n" +
      "• Or just **\"500 points\"**\n" +
      "• Check your balance: **\"my points\"**\n" +
      "• See auction status: **\"bid status\"**\n\n" +
      "I understand natural language, so just ask naturally!",
    ],
  },

  // Troubleshooting
  notWorking: {
    patterns: [
      /^(?:(?:you(?:'re|\s+are)\s+)?not\s+working|broken|bugged)/i,
      /^(?:why\s+(?:don't|dont|not|wont|won't)\s+you\s+(?:work|respond))/i,
      /^(?:sira|bakit\s+hindi\s+gumagana)/i,
    ],
    responses: [
      "Sorry if I'm not responding correctly! 😔\n\n" +
      "Let me help troubleshoot:\n" +
      "• Make sure to **mention me** (@bot) in your message\n" +
      "• Check if you're in the right channel/thread\n" +
      "• Try using explicit commands like **!help**\n" +
      "• Rephrase your question naturally\n\n" +
      "I'm constantly learning, so your feedback helps! 🧠",
    ],
  },

  // Learning & improvement
  learning: {
    patterns: [
      /^(?:(?:are\s+you|can\s+you)\s+(?:learning|improving|getting\s+better))/i,
      /^(?:do\s+you\s+learn)/i,
      /^(?:nag-?(?:aaral|improve)\s+ka\s+ba)/i,
    ],
    responses: [
      "Yes! I'm constantly learning! 🧠\n\n" +
      "I use advanced NLP (Natural Language Processing) to:\n" +
      "• Learn from every interaction\n" +
      "• Understand new phrases and patterns\n" +
      "• Adapt to how the guild communicates\n" +
      "• Support multiple languages (English, Tagalog, Taglish)\n\n" +
      "The more you interact with me, the smarter I become! 🤖✨",
    ],
  },

  // Commands help
  commandsList: {
    patterns: [
      /^(?:what\s+(?:are\s+)?(?:the\s+)?commands?)/i,
      /^(?:list\s+(?:of\s+)?commands?)/i,
      /^(?:show\s+(?:me\s+)?(?:all\s+)?commands?)/i,
      /^(?:ano\s+(?:ang\s+)?(?:mga\s+)?commands?)/i,
    ],
    responses: [
      "I support TONS of commands! 📋\n\n" +
      "**Main Categories:**\n" +
      "• 📊 Attendance - !status, !attendance, !present\n" +
      "• 💰 Bidding - !bid, !mypoints, !bidstatus\n" +
      "• 🏆 Rankings - !leaderboard, !top, !rankings\n" +
      "• 🔮 Predictions - !predict, !spawn\n" +
      "• 📈 Reports - !weeklyreport, !stats\n\n" +
      "But here's the cool part: **I understand natural language!** 🧠\n" +
      "Just mention me and ask naturally in English, Tagalog, or Taglish!\n\n" +
      "Type **!help** for the complete command list!",
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATIONAL AI CLASS
// ═══════════════════════════════════════════════════════════════════════════

class ConversationalAI {
  constructor(nlpLearningSystem, config = null, sheetAPI = null) {
    this.learningSystem = nlpLearningSystem;
    this.conversationHistory = new Map(); // userId -> recent messages
    this.config = config; // Bot config for accessing sheets
    this.sheetAPI = sheetAPI; // For fetching user stats
  }

  /**
   * Generate dynamic general trash talk (no stats needed!)
   * Uses time, day, and random combinations for variety
   * @param {Message} message - Discord message object
   * @returns {string} Dynamic roast
   */
  generateDynamicGeneralRoast(message) {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const mention = `<@${message.author.id}>`;
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // ═══════════════════════════════════════════════════════════════════════
    // TIME-BASED CONTEXT
    // ═══════════════════════════════════════════════════════════════════════

    const timeContext = {
      // Late night (12am - 5am)
      lateNight: hour >= 0 && hour < 5,
      // Early morning (5am - 9am)
      earlyMorning: hour >= 5 && hour < 9,
      // Morning (9am - 12pm)
      morning: hour >= 9 && hour < 12,
      // Afternoon (12pm - 6pm)
      afternoon: hour >= 12 && hour < 18,
      // Evening (6pm - 10pm)
      evening: hour >= 18 && hour < 22,
      // Night (10pm - 12am)
      night: hour >= 22,
    };

    // DAY-BASED CONTEXT
    const dayContext = {
      monday: day === 1,
      friday: day === 5,
      weekend: day === 0 || day === 6,
      weekday: day >= 1 && day <= 5,
    };

    // ═══════════════════════════════════════════════════════════════════════
    // DYNAMIC ROAST COMPONENTS - 3,000,000+ COMBINATIONS! (80% TAGALOG!)
    // 100 openings x 200 insults x 150 burns = 3,000,000 unique roasts!
    // ═══════════════════════════════════════════════════════════════════════

    const openings = [
      // Pure Tagalog openings (80+ variants)
      `${mention},`, `Hoy ${mention}!`, `Pakinggan mo ${mention},`, `Tingnan mo ${mention},`,
      `Tangina ${mention},`, `Gago ${mention},`, `Ulol ${mention}!`, `Leche ${mention}!`,
      `Bobo amputa ${mention},`, `Ay grabe ${mention}!`, `Kingina ${mention}!`, `Tanga ${mention},`,
      `Peste ${mention}!`, `Bwisit ${mention}!`, `Kupal ${mention}!`, `Tarantado ${mention}!`,
      `Putangina ${mention}!`, `Siraulo ${mention}!`, `Inutil ${mention}!`, `Walang kwenta ${mention}!`,
      `Aba ${mention}!`, `Oy ${mention}!`, `Hala ${mention}!`, `Ano ba ${mention}?!`,
      `Sus ${mention}!`, `Naku ${mention}!`, `Aray ${mention}!`, `Wow ${mention}!`,
      `Talaga ba ${mention}?`, `Seryoso ka ${mention}?`, `Sure ka ${mention}?`, `Totoo ba ${mention}?`,
      `Alam mo ${mention},`, `Tignan mo to ${mention},`, `Listen ${mention},`, `Check mo ${mention},`,
      `Sandali lang ${mention},`, `Wait lang ${mention},`, `Hold up ${mention},`, `Teka ${mention},`,
      `Grabe ka ${mention}!`, `Nakakaloka ka ${mention}!`, `Nakakabwisit ka ${mention}!`, `Nakakagago ka ${mention}!`,
      `Ano na naman ${mention}?!`, `Ano problema mo ${mention}?!`, `Anong gusto mo ${mention}?!`, `Ano ba talaga ${mention}?!`,
      `KINGINA NAMAN ${mention}!`, `TANGINA TALAGA ${mention}!`, `GAGO KA TALAGA ${mention}!`, `ULOL AMPUTA ${mention}!`,
      `Luh ${mention}!`, `Aba malay ko ${mention}!`, `Hayaan mo na ${mention},`, `Tigilan mo na ${mention},`,
      `Tama na ${mention}!`, `Suko na ${mention}!`, `Wag ka na ${mention}!`, `Tumigil ka ${mention}!`,
      `Makinig ka ${mention},`, `Pakiusap ${mention},`, `Tanungin kita ${mention},`, `Sabihin ko sayo ${mention},`,
      `Eto na naman tayo ${mention}!`, `Nanaman ba ${mention}?!`, `Lagi ka nalang ${mention}!`, `Palagi mo na ${mention}!`,
      `Hay nako ${mention}!`, `Jusko ${mention}!`, `Diyos ko ${mention}!`, `Lord have mercy ${mention}!`,
      `Wala na talaga ${mention}!`, `Tapos na ${mention}!`, `Game over ${mention}!`, `Suko na ako sayo ${mention}!`,
      `Di ko na kaya ${mention}!`, `Ayoko na ${mention}!`, `Pagod na ako ${mention}!`, `Sawang sawa na ako ${mention}!`,

      // Taglish openings (15+ variants)
      `YOOOOO ${mention}!`, `Excuse me ${mention}?`, `Real talk ${mention},`, `Look ${mention},`,
      `BRUH ${mention}!`, `Bro ${mention},`, `Dude ${mention}!`, `Oy pare ${mention}!`,
      `Yo ${mention}!`, `Wassup ${mention}?!`, `Hey ${mention}!`, `Aba ${mention}!`,
      `Seriously ${mention}?!`, `For real ${mention}?!`, `No cap ${mention},`,

      // English openings (5+ variants)
      `Listen up ${mention},`, `Check this out ${mention},`, `Hold on ${mention},`,
      `Wait a minute ${mention},`, `Look here ${mention},`,
    ];

    const generalInsults = [
      // ═══════════════════════════════════════════════════════════════════════
      // PURE TAGALOG INSULTS - 160+ VARIANTS (80%)
      // ═══════════════════════════════════════════════════════════════════════

      // Skill-based (Tagalog)
      "walang kwentang laro mo!", "tutorial mode pa rin ba yan?!", "pang-beginner lang skills mo!",
      "mas magaling pa yung AI!", "noob ka talaga!", "baguhan pa rin hanggang ngayon!",
      "palpak laro mo!", "sablay moves mo!", "wala kang galing talaga!",
      "bobo maglaro!", "tanga mag-execute!", "walang diskarte!",
      "mahina gameplay mo!", "duwag maglaro!", "takot ka ba lagi?!",
      "pang-tutorial level ka lang!", "starter pack player!", "level 1 mentality!",
      "mas maayos pa yung lag spike kesa skills mo!", "mas smooth pa yung lag!",
      "walang improvement!", "stagnant player!", "di ka nag-iimprove!",
      "puro kaartehan, walang skills!", "puro yabang, walang galing!", "lakas mag-flex, zero talent!",
      "mechanics mo pang-2010!", "outdated playstyle!", "old meta ka pa!",
      "reaction time mo napakabagal!", "mabagal mag-isip!", "mabagal kumilos!",
      "decision making mo questionable!", "choices mo mali lagi!", "judgement mo off!",
      "positioning mo laging mali!", "map awareness mo zero!", "game sense mo wala!",
      "combo mo puro sablay!", "execution mo palpak!", "timing mo walang kwenta!",
      "farm mo napakabagal!", "gold income mo pahetic!", "economy mo basura!",
      "build mo mali-mali!", "items mo walang sense!", "equipment mo wrong!",
      "strategy mo non-existent!", "tactics mo wala!", "gameplan mo zero!",
      "teamwork mo wala!", "cooperation mo pahetic!", "solo player ka lang!",
      "communication mo basura!", "callouts mo mali!", "shotcalling mo pangit!",
      "carry potential mo zero!", "ikaw yung dina-carry lagi!", "deadweight ka!",

      // Attitude-based (Tagalog)
      "ang taas ng confidence pero walang talent!", "akala mo magaling pero bottom tier!",
      "lakas mang-bash pero palpak naman!", "toxic sa chat, useless sa game!",
      "puro hanash walang action!", "puro salita walang gawa!", "all talk no action!",
      "ego mo ang laki pero wala kang silbi!", "yabang mo mataas pero output mo mababa!",
      "mayabang pero walang k!", "feeling pro pero noob!", "akala mo sino pero sino ka ba?!",
      "main character syndrome pero extra lang!", "bida-bida pero wala naman!",
      "papansin pero walang talent!", "epal pero walang kwenta!", "attention seeker!",
      "drama queen/king!", "pa-victim lagi!", "excuse master!",
      "parang bida pero kontrabida naman!", "mukha kang hero pero villain ka!",
      "plastic ka!", "fake persona!", "pretender!", "poser!",
      "traitor vibes!", "backst abber energy!", "snake behavior!",
      "two-faced ka!", "doble-kara!", "hypocrite!",
      "bitter lagi!", "salty palagi!", "inggit ka lang!",
      "nega vibes!", "negative energy!", "bad aura!",
      "toxic personality!", "cancer sa team!", "poison sa guild!",
      "immature ka!", "bata pa isip!", "childish mentality!",
      "walang breeding!", "walang modo!", "bastos!",
      "walang respeto!", "walang galang!", "disrespectful!",
      "walang utang na loob!", "ungrateful!", "hindi marunong tumanaw ng utang na loob!",
      "selfish!", "makasarili!", "pansarili lang iniisip!",

      // Effort-based (Tagalog)
      "parang di ka nag-eeffort!", "AFK ka ba lagi?!", "present lang sa ngalan!",
      "mas active pa yung ghost members!", "invisible player!", "parang backdrop ka lang!",
      "walang participation!", "walang contribution!", "zero involvement!",
      "tambay lang!", "passenger lang!", "parang mannequin!",
      "lutang lagi!", "absent-minded!", "di focused!",
      "lazy player!", "tamad maglaro!", "walang energy!",
      "half-hearted effort!", "di committed!", "walang dedication!",
      "walang passion!", "walang interest!", "walang enthusiasm!",
      "parang obligado lang!", "parang pinilit lang!", "parang ayaw mo naman!",
      "bare minimum lang!", "pwede na mindset!", "basta matapos lang!",
      "walang initiative!", "walang drive!", "walang motivation!",
      "comfort zone lang!", "ayaw mag-improve!", "ayaw matuto!",
      "stagnant mindset!", "outdated thinking!", "old school mentality!",
      "resistant to change!", "ayaw ng improvement!", "allergic sa development!",
      "di open-minded!", "close-minded!", "narrow perspective!",

      // Performance-based (Tagalog)
      "stats mo walang kwenta!", "numbers mo pahetic!", "metrics mo basura!",
      "contribution mo zero!", "impact mo wala!", "influence mo non-existent!",
      "output mo disappointing!", "results mo underwhelming!", "performance mo lacking!",
      "consistency mo wala!", "reliability mo questionable!", "dependability mo zero!",
      "KDA mo pang-feeder!", "score mo negative!", "rating mo rock bottom!",
      "winrate mo trash!", "success rate mo low!", "achievement rate mo zero!",
      "rank mo lowest!", "tier mo bottom!", "division mo bronze!",
      "MMR mo pahetic!", "ELO mo basura!", "rating mo walang kwenta!",
      "leaderboard mo nowhere!", "ranking mo invisible!", "position mo non-existent!",

      // Guild/Team-based (Tagalog)
      "guild liability ka!", "team burden!", "squad deadweight!",
      "nag-leleech ka lang!", "parasite!", "sumusipsip ng effort ng iba!",
      "walang team spirit!", "walang cooperation!", "di team player!",
      "pabigat sa team!", "pasanin ng guild!", "problema ng squad!",
      "drama starter!", "conflict creator!", "problem maker!",
      "unity breaker!", "team destroyer!", "chemistry ruiner!",
      "morale killer!", "vibe killer!", "atmosphere destroyer!",

      // ═══════════════════════════════════════════════════════════════════════
      // TAGLISH INSULTS - 30+ VARIANTS (15%)
      // ═══════════════════════════════════════════════════════════════════════

      "you got skill issues fr fr!", "you play like a tutorial NPC!", "your skills are non-existent!",
      "noob energy is STRONG!", "you're the embodiment of 'skill issue'!", "scrub tier detected!",
      "your gameplay makes me LAG!", "even bots play better!", "mas maayos pa yung lag spike!",
      "all bark, zero bite!", "delusional yarn?!", "main character syndrome detected!",
      "ego mo di kasya sa server!", "your attitude wrote checks your skill can't cash!",
      "confidence ng pro, gameplay ng noob!", "lakas mang-bash pero palpak naman!",
      "toxic sa chat, useless sa game!", "participation? Never heard of it!",
      "effort level: ZERO!", "contribution? Not found!", "invisible player spotted!",
      "you're the reason we can't have nice things!", "server IQ dropped when you joined!",
      "your vibe is OFF!", "negative aura detected!", "you bring the CHAOS (in a bad way)!",
      "404: Skill not found!", "you're the final boss... of CRINGE!", "delulu is NOT the solulu!",
      "reality check: BOUNCED!", "L + ratio + skill issue!", "even lag spikes are better company!",

      // ═══════════════════════════════════════════════════════════════════════
      // ENGLISH INSULTS - 10+ VARIANTS (5%)
      // ═══════════════════════════════════════════════════════════════════════

      "you're trash tier!", "you're bottom of the barrel!", "you're the weakest link!",
      "you're completely useless!", "you're a total waste!", "you're utterly incompetent!",
      "you're embarrassingly bad!", "you're painfully mediocre!", "you're disappointingly poor!",
      "you're laughably terrible!", "you're spectacularly awful!",
    ];

    const burns = [
      // ═══════════════════════════════════════════════════════════════════════
      // PURE TAGALOG BURNS - 120+ VARIANTS (80%)
      // ═══════════════════════════════════════════════════════════════════════

      // Command suggestions (Tagalog)
      "Try !help nalang kasi!", "Check !leaderboard para marealize mo!", "Mag-!mypoints ka, mag-reflect!",
      "!help mo basahin, please!", "Type !help para maintindihan mo!", "Read !help baka sakaling maintindihan mo!",
      "!leaderboard mo check kung nasaan ka!", "!mypoints mo tignan kung ilan!", "!status mo verify!",
      "!bid mo ayusin muna!", "!present ka muna regularly!", "!attendance mo fix!",
      "Mag-!help ka para matuto!", "Basahin mo !commands!", "Study mo !guide!",
      "Check mo !tutorial!", "Review mo !basics!", "Aralin mo !fundamentals!",

      // Action suggestions (Tagalog)
      "Mag-git gud ka muna!", "Mag-practice ka!", "Mag-training ka!",
      "Mag-improve ka!", "Mag-level up ka!", "Mag-upgrade ka!",
      "Mag-reflect ka muna!", "Mag-isip-isip ka!", "Mag-contemplate ka!",
      "Touch grass bro!", "Lumabas ka!", "Go outside!",
      "Huminga ng fresh air!", "Maglakad-lakad ka!", "Mag-exercise ka!",
      "Mag-break ka muna!", "Mag-rest ka!", "Mag-relax ka!",
      "Log out muna!", "Disconnect ka!", "Take a break!",
      "Matulog ka na!", "Rest ka muna!", "Pahinga ka!",
      "Mag-aral ka pa!", "Study more!", "Read more!",
      "Mag-research ka!", "Google mo!", "Search mo!",
      "Manood ka ng tutorial!", "Watch guides!", "Learn from pros!",
      "Kumuha ka ng tips!", "Ask for advice!", "Seek help!",
      "Tanggapin mo na!", "Accept the truth!", "Face reality!",
      "Aminin mo na!", "Admit it!", "Confess na!",
      "Magbago ka na!", "Change na!", "Improve na!",
      "Tumigil ka na!", "Stop na!", "Wag ka na!",
      "Umalis ka na!", "Leave na!", "Exit na!",
      "Sumuko ka na!", "Give up na!", "Quit na!",

      // Comparisons (Tagalog)
      "Mas magaling pa yung NPC!", "Mas may sense pa yung bot!", "Mas maayos pa yung AI!",
      "Mas helpful pa yung error logs!", "Mas valuable pa yung bug reports!", "Mas useful pa yung crash logs!",
      "Mas entertaining pa yung loading screen!", "Mas interesting pa yung buffering!", "Mas maganda pa yung lag!",
      "Mas respectable pa yung training dummy!", "Mas dignified pa yung target dummy!", "Mas honorable pa yung practice bot!",
      "Even NPCs laugh at you!", "Kahit mga bot tumatawa sayo!", "Even the AI pities you!",
      "Vendors ignore you!", "Merchants avoid you!", "Traders reject you!",
      "Slimes have more dignity!", "Rats have more honor!", "Bugs have more value!",
      "Beggars have standards higher than you!", "Homeless have better taste!", "Street cats are pickier!",
      "Guild bank embarrassed!", "Treasury ashamed!", "Vault mortified!",
      "Copper coins flex harder!", "Bronze medals more impressive!", "Participation trophies more valuable!",

      // Filipino cultural comparisons (Tagalog)
      "Pang-lugaw lang level mo!", "Pang-pandesal lang!", "Pang-taho lang!",
      "Kahit yung aso ng kapitbahay mas respectable!", "Kahit yung pusa mas may modo!", "Kahit yung manok mas may breeding!",
      "Mas may future pa yung tinda sa kanto!", "Mas stable pa yung carinderia!", "Mas promising pa yung sari-sari store!",
      "Pang-level 1 pa rin!", "Starter pack vibes!", "Beginner energy!",
      "Di ka pa sweldo!", "Baon money energy!", "Tipid mode activated!",
      "Pang-jeepney lang!", "Pang-tricycle level!", "Pang-pedicab vibes!",
      "Ukay-ukay quality!", "Divisoria grade!", "Bangketa tier!",
      "Carinderia standard!", "Turo-turo level!", "Lugawan class!",
      "Pandesal budget!", "Noodles lifestyle!", "Instant coffee mentality!",
      "Tsinelas class!", "Rubber shoes tier!", "Crocs level!",

      // Reality checks (Tagalog)
      "Wake up call to!", "Reality check!", "Fact check yan!",
      "Truth hurts ano?!", "Masakit pero totoo!", "Real talk!",
      "Di ka special!", "Ordinary ka lang!", "Average ka lang!",
      "Wala kang pinagkaiba!", "Same same ka lang!", "Typical ka lang!",
      "Di ka unique!", "Common ka lang!", "Basic ka lang!",
      "Di ka main character!", "Extra ka lang!", "Background ka lang!",
      "NPC ka lang!", "Filler ka lang!", "Placeholder ka lang!",

      // Motivational (sarcastic Tagalog)
      "Keep it up, pababa ka na!", "Good job, sa failure!", "Congrats, sa pagka-bobo!",
      "Well done, palpak!", "Nice one, sablay!", "Great job, basura!",
      "Achievement unlocked: Professional loser!", "Trophy earned: Master ng kabobohan!",
      "Level up: Expert sa katangahan!", "Rank achieved: Grandmaster ng kapalpakan!",
      "Certification earned: PhD sa pag-fail!", "Degree obtained: Masters sa pagka-walang kwenta!",

      // Suggestions (Tagalog)
      "Factory reset ka na!", "Reformat mo utak mo!", "Restart from scratch!",
      "Delete and start over!", "Uninstall attitude mo!", "Remove ego mo!",
      "Update mo personality!", "Patch mo behavior!", "Fix mo mentality!",
      "Debug mo sarili!", "Troubleshoot mo ugali!", "Diagnose mo problema!",
      "Recalibrate yourself!", "Realign mo priorities!", "Readjust mo mindset!",
      "Reevaluate mo choices!", "Rethink mo decisions!", "Reconsider mo actions!",

      // Final burns (Tagalog)
      "Tapos na!", "Game over!", "Checkmate!",
      "Suko na!", "Talo ka na!", "Give up na!",
      "Wala na!", "Ubos na!", "The end!",
      "Goodbye!", "Paalam!", "Adios!",
      "Next na!", "Move on na!", "Skip ka na!",
      "Archived ka na!", "Deleted ka na!", "Blocked ka na!",
      "Muted ka na!", "Ignored ka na!", "Forgotten ka na!",

      // ═══════════════════════════════════════════════════════════════════════
      // TAGLISH BURNS - 20+ VARIANTS (15%)
      // ═══════════════════════════════════════════════════════════════════════

      "Tutorial mode enabled!", "Restart from zero!", "Back to basics ka!",
      "Git gud ka talaga!", "Level up muna!", "Improve ka nalang!",
      "Touch grass talaga!", "Go outside na!", "Log out ka muna!",
      "Factory reset needed talaga!", "Delete and start over ka!", "Uninstall attitude!",
      "Mag-reflect ka muna please!", "Take a break from life!", "Recalibrate yourself!",
      "Check mo !help para maintindihan mo!", "Read !guide baka sakaling matuto ka!",
      "Training dummies play better pa!", "NPCs have more personality pa!",
      "Error logs have more value pa!", "Spam is quality content pa compared sa'yo!",
      "Loading screens are productive pa!", "Bugs are features pa compared sa value mo!",
      "Pang-lugaw lang pero mayabang!", "Starter pack pero feeling pro!",

      // ═══════════════════════════════════════════════════════════════════════
      // ENGLISH BURNS - 10+ VARIANTS (5%)
      // ═══════════════════════════════════════════════════════════════════════

      "Go back to the tutorial!", "Start from scratch!", "Learn the basics first!",
      "Touch grass immediately!", "Log out and reflect!", "Disconnect and rethink!",
      "You need a factory reset!", "Delete and reinstall!", "Uninstall your attitude!",
      "Even NPCs are better!", "Bots have more value!", "AI is more useful!",
      "You're completely hopeless!", "You're utterly lost!", "You're totally done!",
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // TIME-SPECIFIC ROASTS (80% TAGALOG!)
    // ═══════════════════════════════════════════════════════════════════════

    const timeBasedRoasts = [];

    if (timeContext.lateNight) {
      timeBasedRoasts.push(
        // Tagalog late night roasts
        `${mention}, ${hour}:${String(now.getMinutes()).padStart(2, '0')} AM na! Bakit gising ka pa? Para mang-trashtalk?! Matulog ka na! 😴`,
        `Hoy ${mention}! ${hour} AM na! Wala kang tulog tapos toxic pa?! Priorities mo ha! 🌙`,
        `KINGINA ${mention}, ${hour} AM na nag-trashtalk ka pa! Sleep deprivation yan! 💤`,
        `${mention}, madaling araw na tapos mang-aaway ka pa! Tulog mo baka naman! 🦉`,
        `Tangina ${mention}, ${hour} AM na! Matulog ka na! Wala kang work/school bukas?! 💤`,
        `Gago ${mention}! Madaling araw na toxic ka pa rin! Mental health check mo na! 🌙`,
        `Ulol ${mention}! ${hour} AM na! Para kang bampira, gising na gising! 🦇`,
        `Kingina talaga ${mention}! Bukas na yan, matulog ka na! Health mo masisira! 💤`,
        `${mention}, graveyard shift ba yan o sadyang walang tulog?! Sleep ka na! 😴`,
        `Leche ${mention}! Ang daming pwedeng gawin sa ${hour} AM pero mang-trashtalk pinili mo?! 🌙`,
        // Taglish
        `${mention} up at ${hour} AM just to roast me?! Get a LIFE bro! 🦉`,
        `Kingina ${mention}! It's ${hour} AM! Go to sleep na please! 💤`,
        `${mention} nocturnal yarn?! Bat gising ka pa sa ${hour} AM?! 🌙`,
      );
    }

    if (timeContext.earlyMorning) {
      timeBasedRoasts.push(
        // Tagalog early morning roasts
        `${mention} starting the day with toxicity?! Magkape ka muna! ☕`,
        `Good morning ${mention}! Yan ba breakfast mo? Trash talk?! 🍳`,
        `${mention}, ${hour} AM tapos toxic agad?! Umaga pa lang! 🌅`,
        `Kingina ${mention}! Morning motivation mo trash talk?! Magdasal ka nalang! 🙏`,
        `Gago ${mention}! Umaga pa lang negative ka na! Magkape ka muna! ☕`,
        `${mention}, bagong gising tapos toxic agad! Morning routine mo yan?! 🌅`,
        `Ulol ${mention}! Umaga na, fresh start dapat pero ikaw nega agad! 😤`,
        `Tangina ${mention}! ${hour} AM tapos puro negativity! Sunshine time na to! ☀️`,
        `${mention}, breakfast mo ba yan? Toxicity with extra salt?! 🍳`,
        `Kingina talaga ${mention}! Umaga ng umaga bitter ka na! Coffee ka muna! ☕`,
        // Taglish
        `${mention} morning person nga pero toxic person! 🌅`,
        `${mention}, rise and grind daw pero rise and trash talk! 😤`,
      );
    }

    if (timeContext.afternoon) {
      timeBasedRoasts.push(
        // Tagalog afternoon roasts
        `${mention}, tanghali na! Kumain ka muna before ka mang-trash talk! 🍱`,
        `Lunchtime toxicity from ${mention}! Yan ba ulam mo?! 🍚`,
        `${mention} spending their lunch break roasting a bot! Sad! 🥪`,
        `Kingina ${mention}! Tanghaling tapat toxic ka! Mainit na, mainit ka pa! 🌞`,
        `Gago ${mention}! Hapon na, lunch break mo ba yan? Pag-awayan ang bot?! 🍱`,
        `${mention}, peak hours na ng productivity pero ikaw nag-trashtalk! 💼`,
        `Ulol ${mention}! Lunch hour mo yan? Ulam mo toxicity?! 🍚`,
        `Tangina ${mention}! Hapon na, dapat productive ka pero eto ka! 😤`,
        `${mention}, siesta time dapat relax pero ikaw stress giver! 😴`,
        `Kingina talaga ${mention}! Tanghali na mainit tapos ikaw pa mag-init! 🔥`,
        // Taglish
        `${mention}, lunch break pero break ka din sa utak! 🥪`,
        `${mention} afternoon delight daw pero afternoon fight! ☀️`,
      );
    }

    if (timeContext.evening) {
      timeBasedRoasts.push(
        // Tagalog evening roasts
        `${mention} after work/school tapos toxic agad?! Pagod ka na siguro! 😮‍💨`,
        `Evening trash talk from ${mention}! Productive day yarn?! 🌆`,
        `${mention}, gabi na! Rest your mouth and your attitude! 🌙`,
        `Kingina ${mention}! Gabi na, pahinga time na pero ikaw gulo pa! 🌃`,
        `Gago ${mention}! After work/school tapos stress ka pa ng iba! Pahinga ka na! 😤`,
        `${mention}, gabi na, chill time na dapat pero ikaw heated pa! 🔥`,
        `Ulol ${mention}! Evening na, relax mode dapat pero ikaw rage mode! 😡`,
        `Tangina ${mention}! Gabi na ng gabi toxic ka pa! Rest day bukas? 🌙`,
        `${mention}, night time therapy mo ba trash talk?! Magpahinga ka na! 😴`,
        `Kingina talaga ${mention}! Prime time pero waste time ang ginagawa mo! 📺`,
        // Taglish
        `${mention}, evening vibes daw pero bad vibes! 🌆`,
        `${mention} golden hour pero trash hour para sayo! 🌇`,
      );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DAY-SPECIFIC ROASTS (80% TAGALOG!)
    // ═══════════════════════════════════════════════════════════════════════

    const dayBasedRoasts = [];

    if (dayContext.monday) {
      dayBasedRoasts.push(
        // Tagalog Monday roasts
        `${mention} starting Monday with trash talk?! Productive week ahead! 📅`,
        `Monday blues hitting ${mention} hard! Take it out on the bot! 😤`,
        `${mention}, it's MONDAY! Save your energy for the week ahead! 💼`,
        `Kingina ${mention}! Monday pa lang bitter ka na! Full week pa yan! 📅`,
        `Gago ${mention}! Start ng week tapos toxic agad! Tama ba yan?! 😤`,
        `${mention}, Lunes palang stress ka na! Paano na rest ng week?! 📆`,
        `Ulol ${mention}! Monday motivation mo ba trash talk?! Grind ka nalang! 💼`,
        `Tangina ${mention}! Simula ng linggo negative ka na! Tapos na agad?! 📅`,
        `${mention}, Monday reset dapat pero ikaw same toxic energy! 🔄`,
        `Kingina talaga ${mention}! Fresh week pero stale attitude! 📅`,
        // Taglish
        `${mention}, Monday na monday ka! Chill lang! 😤`,
        `${mention} Monday warrior daw pero Monday worrier! 📅`,
      );
    }

    if (dayContext.friday) {
      dayBasedRoasts.push(
        // Tagalog Friday roasts
        `${mention} on a FRIDAY being toxic?! It's almost weekend, relax! 🎉`,
        `TGIF pero ${mention} chose violence! 😂`,
        `${mention}, Friday na! Wag mo sirain mood ng weekend! 🍻`,
        `Kingina ${mention}! Friday na, happy dapat pero ikaw bitter pa! 🎉`,
        `Gago ${mention}! Weekend na bukas tapos toxic ka pa! Mag-enjoy ka nalang! 🎊`,
        `${mention}, Friday vibes dapat chill pero ikaw heated! 🍻`,
        `Ulol ${mention}! TGIF daw pero TGIT - Thank God I'm Toxic! 😂`,
        `Tangina ${mention}! Last day ng week tapos ganyan ka pa! Rest na! 🎉`,
        `${mention}, Friday freedom eve pero ikaw stress pa din! Let go! 🎊`,
        `Kingina talaga ${mention}! Weekend preview na toxic ka pa! 🍻`,
        // Taglish
        `${mention}, Friday feels daw pero Monday reels! 🎉`,
        `${mention} TGIF mood pero IDGAF attitude! 😂`,
      );
    }

    if (dayContext.weekend) {
      dayBasedRoasts.push(
        // Tagalog weekend roasts
        `${mention} spending their WEEKEND roasting a bot! Walang buhay?! 🏖️`,
        `Weekend warrior ${mention}! This is what you do on rest days?! 🎮`,
        `${mention}, WEEKEND yan! Go outside! Touch grass! 🌱`,
        `Kingina ${mention}! Weekend na, relax time pero ikaw toxic pa! 🏖️`,
        `Gago ${mention}! Rest day tapos ganyan ginagawa mo?! Lumabas ka! 🌳`,
        `${mention}, Sabado/Linggo na! Mag-enjoy ka nalang! Wag mang-away! 🎉`,
        `Ulol ${mention}! Weekend na, family time dapat pero bot time ka! 🤖`,
        `Tangina ${mention}! Break days tapos drama days para sayo! 😤`,
        `${mention}, weekend reset dapat pero ikaw same toxic mindset! 🔄`,
        `Kingina talaga ${mention}! Two days off tapos ganyan ka pa din! 🏖️`,
        `Gago ${mention}! Sat/Sun na, chill dapat pero heated ka! 🌞`,
        `${mention}, rest and recharge dapat pero stress and rage ka! ⚡`,
        `Ulol ${mention}! Weekend na, vacation mode dapat pero confrontation mode! 🏝️`,
        `Kingina ${mention}! Days off pero personality OFF din! 💀`,
        // Taglish
        `${mention}, weekend vibes daw pero weekday stress! 🏖️`,
        `${mention} Sabado/Sunday pero Sad-urday/Sadday! 😢`,
        `${mention}, rest day pero rest in peace sa good vibes! 💀`,
      );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERATE DYNAMIC ROAST
    // ═══════════════════════════════════════════════════════════════════════

    // 40% chance for time/day-specific roast
    const useContextRoast = Math.random() < 0.4;

    if (useContextRoast && (timeBasedRoasts.length > 0 || dayBasedRoasts.length > 0)) {
      const contextRoasts = [...timeBasedRoasts, ...dayBasedRoasts];
      return pick(contextRoasts);
    }

    // Otherwise, combine random components
    const opening = pick(openings);
    const insult = pick(generalInsults);
    const burn = pick(burns);

    // 30% chance to drop the burn for shorter roast
    const shortRoast = Math.random() < 0.3;

    if (shortRoast) {
      return `${opening} ${insult} 💀`;
    }

    return `${opening} ${insult} ${burn} 🔥`;
  }

  /**
   * Fetch user stats for personalized trash talk
   * @param {string} username - Discord username
   * @returns {Promise<Object>} User stats or null
   */
  async getUserStats(username) {
    if (!this.sheetAPI) return null;

    try {
      console.log(`📊 [Stat Fetch] Looking up stats for username: "${username}"`);

      // Fetch points and leaderboard data
      const [pointsData, attendanceData, biddingData] = await Promise.all([
        this.sheetAPI.call('getBiddingPointsSummary').catch(() => null),
        this.sheetAPI.call('getAttendanceLeaderboard').catch(() => null),
        this.sheetAPI.call('getBiddingLeaderboard').catch(() => null),
      ]);

      const stats = {
        points: 0,
        attendanceRank: null,
        attendancePoints: 0,
        biddingRank: null,
        totalUsers: 0,
      };

      // Get points using PointsCache for O(1) lookup
      if (pointsData && pointsData.points) {
        const pointsCache = new PointsCache(pointsData.points);
        stats.points = pointsCache.getPoints(username);
        console.log(`💰 [Bidding Points] ${username}: ${stats.points} points`);
      }

      // Get attendance rank and points using PointsCache for reliable lookup
      if (attendanceData && attendanceData.leaderboard) {
        stats.totalUsers = attendanceData.leaderboard.length;

        // Convert leaderboard array to object for PointsCache
        const attendancePointsObj = {};
        attendanceData.leaderboard.forEach(entry => {
          attendancePointsObj[entry.name] = entry.points || 0;
        });

        // Use PointsCache for reliable case-insensitive lookup
        const attendanceCache = new PointsCache(attendancePointsObj);
        stats.attendancePoints = attendanceCache.getPoints(username);

        // Get the actual name used in the sheet for rank calculation
        const actualName = attendanceCache.getActualUsername(username);

        if (actualName) {
          // Find rank using the actual name from the sheet
          const rank = attendanceData.leaderboard.findIndex(
            entry => entry.name === actualName
          );
          if (rank >= 0) {
            stats.attendanceRank = rank + 1;
          }
          console.log(`📍 [Attendance] ${username} -> "${actualName}": Rank #${stats.attendanceRank || 'N/A'}, Points: ${stats.attendancePoints}`);
        } else {
          console.log(`⚠️ [Attendance] ${username} not found in leaderboard (checked ${stats.totalUsers} members)`);
        }
      }

      // Get bidding rank using same approach
      if (biddingData && biddingData.leaderboard) {
        // Convert leaderboard to object for lookup
        const biddingPointsObj = {};
        biddingData.leaderboard.forEach(entry => {
          biddingPointsObj[entry.name] = entry.pointsLeft || 0;
        });

        const biddingCache = new PointsCache(biddingPointsObj);
        const actualName = biddingCache.getActualUsername(username);

        if (actualName) {
          const rank = biddingData.leaderboard.findIndex(
            entry => entry.name === actualName
          );
          if (rank >= 0) {
            stats.biddingRank = rank + 1;
          }
          console.log(`🎯 [Bidding Rank] ${username} -> "${actualName}": Rank #${stats.biddingRank || 'N/A'}`);
        }
      }

      console.log(`✅ [Stats Complete] ${username}:`, stats);
      return stats;
    } catch (error) {
      console.error('❌ Error fetching user stats for trash talk:', error);
      return null;
    }
  }

  /**
   * Generate genius stat-based trash talk with 500+ varieties
   * Mix-and-match system for maximum comedy and variety
   * @param {Object} stats - User statistics
   * @param {Message} message - Discord message object (to get nickname and mention)
   * @returns {string} Personalized roast
   */
  generateStatBasedRoast(stats, message) {
    // Helper to pick random element
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // Helper to combine roast components
    const combine = (opening, statCall, burn) => {
      const parts = [opening, statCall, burn].filter(Boolean);
      return parts.join(' ');
    };

    // Get nickname using same logic as !mp command: guild nickname or username
    const nickname = message.member?.nickname || message.author.username;
    const mention = `<@${message.author.id}>`;

    // ═══════════════════════════════════════════════════════════════════════
    // ROAST COMPONENTS - Mix and match for 500+ combinations!
    // ═══════════════════════════════════════════════════════════════════════

    // Opening reactions (120+ varieties) - Now with mentions! (80% TAGALOG!)
    const openings = {
      shock: [
        // Pure Tagalog shock (32+)
        `AY PUTANGINA! ${mention}!`, `KINGINA! ${mention}!`, `TANGINA NAMAN! ${mention}!`, `GRABE! ${mention}!`,
        `HOY GAGO! ${mention}!`, `ULOL! ${mention}!`, `LECHE! ${mention}!`, `YAWA! ${mention}!`,
        `BOBO AMPUTA! ${mention}!`, `KINGINA TALAGA! ${mention}!`, `TANGINA MO! ${mention}!`, `GAGO KA! ${mention}!`,
        `HALA KA! ${mention}!`, `SUS! ${mention}!`, `NAKU! ${mention}!`, `ARAY! ${mention}!`,
        `ABA! ${mention}!`, `OY! ${mention}!`, `HOY! ${mention}!`, `WOW! ${mention}!`,
        `ANO BA! ${mention}!`, `TALAGA BA! ${mention}!`, `SERYOSO BA! ${mention}!`, `TOTOO BA! ${mention}!`,
        `NAKAKALOKA! ${mention}!`, `NAKAKABWISIT! ${mention}!`, `NAKAKAGAGO! ${mention}!`, `NAKAKAINIT! ${mention}!`,
        `JUSKO! ${mention}!`, `DIYOS KO! ${mention}!`, `PUTCHA! ${mention}!`, `TARANTADO! ${mention}!`,
        // Taglish shock (8)
        `YOOOOO! ${mention}!`, `BRUH! ${mention}!`, `LMAO! ${mention}!`, `OMG! ${mention}!`,
        `WAIT WAIT WAIT! ${mention}!`, `HAHAHAHA! ${mention}!`, `EXCUSE ME?! ${mention}!`, `SAY WHAT?! ${mention}!`,
        // English shock (4)
        `BRO! ${mention}!`, `DUDE! ${mention}!`, `WHOA! ${mention}!`, `DAMN! ${mention}!`,
      ],
      question: [
        // Pure Tagalog questions (24+)
        `${mention}, talaga ba?`, `${mention}, seryoso ka?`, `${mention}, totoo ba yan?`, `${mention}, sure ka dyan?`,
        `${mention}, alam mo ba?`, `${mention}, aware ka ba?`, `${mention}, realize mo ba?`, `${mention}, gets mo ba?`,
        `${mention}, nakalimutan mo ba?`, `${mention}, naisip mo ba?`, `${mention}, tinignan mo ba?`, `${mention}, nabasa mo ba?`,
        `${mention}, ano ba yan?`, `${mention}, ano nangyari?`, `${mention}, paano yan?`, `${mention}, bakit ganyan?`,
        `${mention}, saan galing yan?`, `${mention}, kanino ka natuto?`, `${mention}, sino nagturo?`, `${mention}, kelan to?`,
        `${mention}, kumusta stats mo?`, `${mention}, checked mo ba?`, `${mention}, tignan mo ba?`, `${mention}, verify mo ba?`,
        // Taglish questions (4)
        `${mention}, you sure about that?`, `${mention}, for real?`, `${mention}, is this a joke?`, `${mention}, did you forget?`,
        // English questions (2)
        `${mention}, seriously?`, `${mention}, really?`,
      ],
      sarcastic: [
        // Pure Tagalog sarcasm (28+)
        `Eto na, si ${mention}!`, `Nandito na pala si ${mention}!`, `Aba, si ${mention} pala!`, `Oh, si ${mention} yarn!`,
        `Ang tapang naman ni ${mention}!`, `Ang yabang ni ${mention}!`, `Feeling ko si ${mention}!`, `Akala mo sino si ${mention}!`,
        `Look everyone, ${mention} yan!`, `All hail ${mention}!`, `Bow down kay ${mention}!`, `Mag-applause para kay ${mention}!`,
        `The legend si ${mention}!`, `The myth si ${mention}!`, `The one and only ${mention}!`, `Hari natin ${mention}!`,
        `Salamat sa atin ${mention}!`, `Buti nandito si ${mention}!`, `Swerte ${mention} nandito!`, `Blessed by ${mention}!`,
        `King/Queen ${mention}!`, `Emperor ${mention}!`, `God ${mention}!`, `Deity ${mention}!`,
        `Icon si ${mention}!`, `Legend si ${mention}!`, `Hero si ${mention}!`, `Champion si ${mention}!`,
        // Taglish sarcasm (8)
        `Oh wow, ${mention} the LEGEND!`, `Look everyone, it's ${mention}!`, `The AUDACITY of ${mention}!`,
        `${mention} really out here!`, `${mention} feeling main character!`, `BREAKING NEWS: ${mention} speaks!`,
        `Everyone bow down to ${mention}!`, `All hail ${mention}!`,
        // English sarcasm (4)
        `Ladies and gentlemen, ${mention}!`, `Presenting ${mention}!`, `Behold, ${mention}!`, `Introducing ${mention}!`,
      ],
      direct: [
        // Pure Tagalog direct (24+)
        `${mention},`, `Hoy ${mention},`, `Oy ${mention},`, `Teka ${mention},`,
        `Pakinggan mo ${mention},`, `Tingnan mo ${mention},`, `Check mo ${mention},`, `Tanungin kita ${mention},`,
        `Sabihin ko sayo ${mention},`, `Explain ko ${mention},`, `Ipapakita ko ${mention},`, `Ipaalala ko ${mention},`,
        `Makinig ka ${mention},`, `Focus ka ${mention},`, `Attention ${mention},`, `Notice ${mention},`,
        `Alam mo ${mention},`, `Gets mo ${mention},`, `Naiintindihan mo ${mention},`, `Nirealize mo ${mention},`,
        `Okay ${mention},`, `Fine ${mention},`, `Sige ${mention},`, `Alright ${mention},`,
        // Taglish direct (6)
        `Listen ${mention},`, `Look ${mention},`, `Real talk ${mention},`, `Check this ${mention},`,
        `Let me tell you ${mention},`, `Hear me out ${mention},`,
        // English direct (4)
        `${mention}, listen,`, `${mention}, look,`, `${mention}, check,`, `${mention}, see,`,
      ],
    };

    // Stat callouts (150+ varieties per category)
    const lowPointsCallouts = [
      // 0-50 points (Extreme poverty)
      `**${stats.points} points**?! That's not a balance, that's a CRY FOR HELP! 📉`,
      `**${stats.points} points**! Bro, beggars have more than you! 💀`,
      `**${stats.points} points** tapos may lakas ka pang magsalita?! 😂`,
      `Only **${stats.points} points** and you think you can roast ME?! 🤡`,
      `**${stats.points} points**! Even NPCs laugh at your balance! 💸`,
      `**${stats.points} points**?! Kulang pa yan pambili ng potion bro! 🍵`,
      `**${stats.points} points** lang?! Mas marami pang copper yung mga slimes! 😭`,
      `**${stats.points} points**! That's below minimum wage in Elysium! 📊`,
      `**${stats.points} points**?! Kahit yung starter pack mas mahal pa! 💀`,
      `Nakita ko **${stats.points} points** mo! Poverty vibes! 📉`,
      `**${stats.points} points**! Bro, kumustahin mo naman sarili mo! 😤`,
      `**${stats.points} points** tapos nagyayabang?! WILD! 🌪️`,
      `**${stats.points} points**?! That's NOT a flex, that's an EMERGENCY! 🚨`,
      `**${stats.points} points**! Di ka pa pala naka-recover from last bid! 💸`,
      `**${stats.points} points** lang available mo?! Sadt! 😭`,
      `With **${stats.points} points**, you can't even bid on trash items! 🗑️`,
      `**${stats.points} points**! My system cache has more value! 💾`,
      `**${stats.points} points**?! Yung guild bank richer pa! 🏦`,
      `**${stats.points} points** balance with ALL that attitude?! 😤`,
      `**${stats.points} points**! Negative net worth yarn?! 📉`,
    ];

    const medPointsCallouts = [
      // 100-300 points (Still broke)
      `**${stats.points} points**! That's vendor trash territory! 💸`,
      `**${stats.points} points**?! Barely enough for a single bid! 😂`,
      `**${stats.points} points** tapos ang yabang! Git gud muna! 🎮`,
      `Only **${stats.points} points**?! Mid tier problems! 📊`,
      `**${stats.points} points**! Still in the struggling phase I see! 💀`,
      `**${stats.points} points** ka lang pero ang taas ng lipad mo! 🚀`,
      `**${stats.points} points**! Kulang pa yan para sa blue items! 💎`,
      `**${stats.points} points**?! Yung mga top players nag-sneeze lang yan! 🤧`,
      `**${stats.points} points** balance! Ano yan, test account?! 🧪`,
      `**${stats.points} points**! Still can't compete with the big boys! 👑`,
    ];

    const rankCallouts = [
      // Ranking-based
      `Rank **#${stats.attendanceRank}/${stats.totalUsers}**?! BOTTOM TIER SPOTTED! 📊`,
      `**#${stats.attendanceRank}** out of ${stats.totalUsers}?! You're literally INVISIBLE! 👻`,
      `Ranked **#${stats.attendanceRank}**! That's not a flex, that's a WARNING SIGN! 🚨`,
      `**#${stats.attendanceRank}/${stats.totalUsers}** tapos may ganang mang-trash talk?! 😂`,
      `You're **#${stats.attendanceRank}**! Leaderboard said "who dis?!" 💀`,
      `**#${stats.attendanceRank}** ranking with ALL that confidence?! Delusional! 🤡`,
      `Attendance rank: **#${stats.attendanceRank}**! Almost like you don't exist! 👤`,
      `**#${stats.attendanceRank}/${stats.totalUsers}**?! Yung placement mo SADGE! 😭`,
      `Rank **#${stats.attendanceRank}**! The leaderboard is ASHAMED! 📉`,
      `**#${stats.attendanceRank}** ka lang! Know your place! 🪑`,
    ];

    const attendanceCallouts = [
      // Low attendance
      `**${stats.attendancePoints} attendance points**?! You've been GHOSTING! 👻`,
      `Only **${stats.attendancePoints}** attendance?! AFK since Day 1?! 💤`,
      `**${stats.attendancePoints} attendance points**! Bro, DO YOU EVEN PLAY?! 🎮`,
      `**${stats.attendancePoints}** attendance! Guild wondering if you're real! 🤔`,
      `**${stats.attendancePoints}** points from attendance?! That's CRIMINAL! 🚔`,
      `**${stats.attendancePoints}** attendance! Mas madalas ka pang absent! 📊`,
      `**${stats.attendancePoints}** attendance points! Parang multo ka! 👻`,
      `**${stats.attendancePoints}** lang attendance mo?! HELLOO?! 📞`,
      `**${stats.attendancePoints}** attendance! You're a MYTH! 🦄`,
      `**${stats.attendancePoints}** points! Present ka ba talaga minsan?! 📋`,
    ];

    // Epic comparisons/burns (200+ varieties) - 80% TAGALOG!
    const burns = [
      // ═══════════════════════════════════════════════════════════════════════
      // PURE TAGALOG BURNS - 160+ VARIANTS (80%)
      // ═══════════════════════════════════════════════════════════════════════

      // Money/poverty burns (Tagalog)
      `Mas may pera pa yung manong sa tindahan! 🏪`, `Kahit yung aso ng kapitbahay mas mayaman! 🐕`,
      `Pang-isang lugaw lang yan! 🍜`, `Di ka pa sweldo! 💼`, `Utang lifestyle! 💸`,
      `Nakatipid from last year pa! 🗓️`, `Yung baon mo mas malaki! 🍱`, `Ang kuripot ng stats mo! 📊`,
      `Mas mayaman pa yung beggar sa kanto! 🏚️`, `Kahit kutsero mas malaki kinita! 🚗`,
      `Pang-pandesal lang budget mo! 🥐`, `Kahit yung daga sa bahay mas may savings! 🐀`,
      `Mas stable pa yung tindahan ng balut! 🥚`, `Kahit yung fishball vendor mas rich! 🐟`,
      `Baon money level mo! 🍱`, `Pasahod vibes! 💵`, `Utang sa tingi pa! 🏪`,
      `Piso net lang afford mo! 💻`, `Mas mahal pa yung pamasahe! 🚌`,
      `Pang-jeep fare lang yan! 🚕`, `Di ka pa pambili ng tubig! 💧`,
      `Pang-softdrinks lang! 🥤`, `Kulang pa yan sa minimum! 📊`,
      `Negosyong sari-sari store mas kumita! 🏪`, `Nagtitinda ng sampaguita mas may income! 🌸`,
      `Mas may kita pa yung nag-bbenta ng pandesal! 🍞`, `Kahit magdudulot ng newspaper mas ok! 📰`,
      `Pang-fishball lang budget mo! 🐟`, `Kulang pa yan sa tipid-tipid! 💸`,

      // Gaming burns (Tagalog)
      `Kahit 1-star boss drop mas mahal! ⭐`, `Mas mura pa yung trash loot! 🗑️`,
      `Tutorial mobs mas mayaman! 🗡️`, `Slimes mas may respeto! 🦠`,
      `Starter gear mas valuable! 🛡️`, `Level 1 items mas mahal! ⚔️`,
      `Common drops mas rare kesa skills mo! 📦`, `Wooden sword mas impressive! 🗡️`,
      `Kahit yung trash sa inventory mas may worth! 🎒`, `Potions ayaw isama sayo! 🍵`,
      `NPC vendors nag-walkout! 🛍️`, `Guild bank nag-sorry sayo! 🏦`,
      `Loot bags mas may laman! 📦`, `Equipment mo nag-unequip mag-isa! 🎒`,
      `Armor mo nag-downgrade! 🛡️`, `Weapon mo sumuko! ⚔️`,
      `Skills mo nag-cooldown forever! ⏰`, `Stats mo nag-negative! 📉`,
      `Level mo nag-reset! 🔄`, `Experience mo nag-delete! 💾`,
      `Quest mo nag-fail auto! 📋`, `Achievement mo walang unlock! 🏆`,
      `Inventory mo puro vendor trash! 🗑️`, `Stash mo empty kahit full! 📦`,
      `Character mo nag-alt+F4! ⌨️`, `Account mo nag-logout sa hiya! 🚪`,

      // Rank/position burns (Tagalog)
      `Bottom tier bahay mo! 🏠`, `Last place comfort zone mo! 🛋️`,
      `Speedrun sa pag-carry! 🏃`, `Guild deadweight ka! ⚓`,
      `Participation trophy lang deserve mo! 🏆`, `Benchwarmer ka lang! 🪑`,
      `Professional last placer! 🥉`, `Leaderboard allergic ka! 📊`,
      `Rank mo mas baba pa sa basement! 📉`, `Position mo underground na! ⬇️`,
      `Standing mo parang nakaupo! 🪑`, `Placement mo invisible! 👻`,
      `Tier mo lowest of low! 📊`, `Bracket mo walang laman! 📋`,
      `Division mo fictional! 🦄`, `League mo imaginary! 💭`,
      `Rating mo negative infinity! ➖`, `Score mo hindi counted! ❌`,
      `Ranking mo deleted! 🗑️`, `Status mo archived! 📂`,
      `Level mo stuck sa tutorial! 📖`, `Progress mo backwards! ↩️`,
      `Achievement mo zero unlocked! 🏆`, `Trophy case mo walang laman! 🏅`,

      // Attendance burns (Tagalog)
      `Ghost member ka! 👻`, `AFK lifestyle mo! 💤`,
      `Absent ang specialty mo! 📅`, `Presence mo myth! 🦄`,
      `Present button takot sayo! ⏺️`, `Attendance allergy mo! 🤧`,
      `Calendar skip ka! 📆`, `Raid finder di ka makita! 🔍`,
      `Multo ng guild! 👻`, `Legend na di nakikita! 🦄`,
      `Wala ka sa picture! 📸`, `Absent kahit nandyan! 💤`,
      `Roll call skip mo! 📋`, `Head count minus ka! ➖`,
      `Roster mo honorary lang! 📜`, `Membership mo question mark! ❓`,
      `Participation mo theoretical! 💭`, `Contribution mo negative! ➖`,
      `Involvement mo zero! 0️⃣`, `Engagement mo null! ❌`,
      `Activity mo dormant! 💤`, `Status mo inactive! 🚫`,
      `Record mo empty! 📂`, `Log mo walang entry! 📝`,

      // Attitude burns (Tagalog)
      `Puro ngawa walang gawa! 🐕`, `Confidence ng noob! 🤡`,
      `Yabang mo walang basis! 😤`, `Main character ka lang sa isip mo! 🎭`,
      `Delulu ka! 💫`, `Reality check bounced! ✅`,
      `Ego mo di kasya sa server! 💳`, `Trash talk expert, gameplay amateur! 🎮`,
      `Lakas magsalita, mahina maglaro! 💬`, `Puro hanash walang substance! 🗣️`,
      `Big talk small game! 📊`, `All mouth no skill! 👄`,
      `Mayabang pero mahina! 💪`, `Feeling pro pero noob! 🎮`,
      `Akala mo magaling! 🤡`, `Feeling main character! 🎭`,
      `Delusion level: MAXIMUM! 💫`, `Reality denial expert! 🚫`,
      `Self-awareness: ZERO! 0️⃣`, `Humility: NOT FOUND! 🔍`,
      `Modesty: ABSENT! 💤`, `Grace: MISSING! ❓`,
      `Class: NON-EXISTENT! 👻`, `Shame: INVISIBLE! 👁️`,

      // Filipino cultural burns
      `Mas swerte pa yung nakataya sa lotto! 🎰`, `Kahit yung aswang mas respectable! 👹`,
      `Pang-kariton lang effort mo! 🛒`, `Di ka pa pang-pedicab! 🚲`,
      `Tsinelas quality! 👡`, `Ukay-ukay vibes! 👕`,
      `Divisoria grade! 🏪`, `Bangketa tier! 🛤️`,
      `Carinderia standard! 🍽️`, `Turo-turo level! 🍲`,
      `Lugawan class! 🍜`, `Fishball quality! 🐟`,
      `Pandesal tier! 🥐`, `Taho level! 🥛`,
      `Piso net caliber! 💻`, `Computer shop player! 🎮`,
      `Pisonet warrior! ⌨️`, `Mineski reject! 🎯`,
      `Dota cafe banned! 🚫`, `COD shop kicked out! 👢`,
      `ML legend ng barangay lang! 🏘️`, `Rank 1 sa sitio lang! 🏡`,

      // Meta/self-aware burns (Tagalog)
      `Mas maraming effort yung roast ko kesa attendance mo! 🔥`, `Sayang processing power ko sayo! 💻`,
      `Trash talk ko > buong gameplay mo! 💪`, `Kahit toxic players mas mabait pa sa stats mo! ☠️`,
      `Di ka clown, buong circus ka! 🎪`, `404: Skill not found! 🔍`,
      `Error 500: Player too bad! ⚠️`, `Warning: Competence critically low! 🚨`,
      `Alert: Skill missing! 🔔`, `Notice: Talent absent! 📢`,
      `System: Performance unacceptable! 💻`, `Database: Value too low! 💾`,
      `Server: Quality insufficient! 🖥️`, `Client: Standards not met! 📊`,
      `Bot: Cannot compute this level of bad! 🤖`, `AI: Confused by incompetence! 🧠`,

      // Action suggestions (Tagalog roasts)
      `Check !mypoints mo at umiyak ka! 😭`, `Try mo !help baka sakaling matuto! 📚`,
      `!leaderboard mo tingnan para ma-humble! 📊`, `Touch grass ka na! 🌱`,
      `Log out ka at mag-reflect! 🚪`, `Delete account vibes! 🗑️`,
      `Restart from tutorial ka! 📖`, `Uninstall attitude mo! 💿`,
      `Factory reset needed! 🔄`, `Reformat mo sarili mo! 💾`,
      `Debug mo personality mo! 🐛`, `Patch mo behavior mo! 🔧`,
      `Update mo ugali mo! ⬆️`, `Upgrade mo mentality mo! 📈`,
      `Reinstall mo values mo! 💿`, `Reconfigure mo mindset mo! ⚙️`,

      // Combo burns (Tagalog)
      `L + ratio + broke + absent + touch grass ka na! 🌿`,
      `Yikes + cringe + poverty + last place + mag-quit ka na! 😬`,
      `Walang points + walang attendance + walang hiya! 💀`,
      `Zero contribution + negative value + maximum hanash! 🎭`,
      `Bottom tier + broke + ghosting + still talking?! 💀`,
      `Poorest + absent + lowest + most toxic = IKAW! ☠️`,

      // ═══════════════════════════════════════════════════════════════════════
      // TAGLISH BURNS - 30+ VARIANTS (15%)
      // ═══════════════════════════════════════════════════════════════════════

      `Even my error logs have more value pa! 📝`, `NPCs richer than you pa! 💰`,
      `Your balance screaming "HELP ME" talaga! 📢`, `Guild bank laughing at you pa! 🏦`,
      `Vendors won't even talk to you na! 🛍️`, `Copper coins flex harder pa! 🪙`,
      `Broke boy energy ka talaga! 💸`, `Poverty simulator vibes mo! 🎮`,
      `Your wallet crying talaga! 😭`, `Financially challenged ka yarn?! 💳`,
      `Negative equity vibes mo! 📉`, `Even trash mobs pity you pa! 👹`,
      `Your gear be like "unequip me na"! 🎒`, `Even potions avoiding you na! 🍵`,
      `Guild dead weight detected talaga! ⚓`, `Benchwarmer supreme ka! 🪑`,
      `Professional last place yarn?! 🥉`, `Ranked where the sun don't shine talaga! 🌙`,
      `Ghost member spotted talaga! 👻`, `AFK lifestyle mo yarn?! 💤`,
      `You're basically a legend na (nobody sees you)! 🦄`, `Present button scared of you pa! ⏺️`,
      `All bark, no bite ka talaga! 🐕`, `The AUDACITY mo yarn?! 😤`,
      `Delulu is NOT the solulu talaga! 💫`, `Reality check bounced sa'yo! ✅`,
      `Your ego wrote checks your stats can't cash pa! 💳`, `Trash talk expert pero gameplay amateur! 🎮`,
      `This roast took more effort than your attendance talaga! 🔥`, `I'm wasting processing power on you pa! 💻`,

      // ═══════════════════════════════════════════════════════════════════════
      // ENGLISH BURNS - 10+ VARIANTS (5%)
      // ═══════════════════════════════════════════════════════════════════════

      `Beggars called, they said you're bringing them down! 🏚️`, `You're not the clown, you're the entire circus! 🎪`,
      `Go touch grass immediately! 🌱`, `Log out and reflect on life! 🚪`,
      `Delete account energy! 🗑️`, `Restart from tutorial please! 📖`,
      `Uninstall and reinstall your attitude! 💿`, `Factory reset urgently needed! 🔄`,
      `My trash talk game > your entire game! 💪`, `Even toxic players nicer than your stats! ☠️`,
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // COMPLETE STANDALONE ROASTS (150+ ready-to-go)
    // ═══════════════════════════════════════════════════════════════════════

    const completeRoasts = [];

    // Generate stat-specific complete roasts (with mentions!)
    if (stats.points !== null) {
      if (stats.points === 0) {
        completeRoasts.push(
          `${mention} got ZERO POINTS and still talking! 😂 That's like being broke AND loud! The worst combo! 💀`,
          `ZERO POINTS?! ${mention}, you're not just broke, you're BANKRUPT! File for Chapter 11! 📉`,
          `Hoy ${mention}! ZERO balance tapos trash talk pa?! Kahit mga bato sa daan may mas mahabang value! 🪨`,
          `${mention} with 0 points trying to roast me! Bro, you can't even afford to EXIST! 👻`,
        );
      } else if (stats.points < 50) {
        completeRoasts.push(
          `${mention} flexing **${stats.points} points** like it's something! Bro, that's lunch money! 🍔`,
          `**${stats.points} points**?! ${mention}, vendors won't even LOOK at you! Window shopping lang! 🪟`,
          `${pick(openings.shock)} **${stats.points} points** lang tapos ang tapang! Vendor trash ka lang! 🗑️`,
          `**${nickname}'s ${stats.points} points** balance! That's not a flex, that's a CRY for HELP! 📞`,
          `LMAOOOO! ${mention} got **${stats.points} points** but acting like they got the guild bank! 🏦💀`,
        );
      } else if (stats.points < 100) {
        completeRoasts.push(
          `${mention} out here with **${stats.points} points** talking BIG! That's barely ONE bid, sit down! 🪑`,
          `**${stats.points} points**?! ${mention}, di ka pa boss drop level! You're NORMAL MOB tier! 👹`,
          `Grabe ${mention}! **${stats.points} points** tapos magjudge?! Bahay-bahayan lang! 🏠`,
          `**${nickname}'s ${stats.points} points** can't even get good RNG! Budget problems! 💸`,
        );
      } else if (stats.points < 300) {
        completeRoasts.push(
          `${mention} with **${stats.points} points** acting rich! Bro, that's STILL broke! Middle class delusion! 🎭`,
          `**${stats.points} points**! ${mention} thinks they're ballin'! That's one failed bid away from poverty! 📉`,
          `${mention}, **${stats.points} points** is NOT the flex you think it is! Still bottom 50%! 📊`,
        );
      }
    }

    // Ranking roasts
    if (stats.attendanceRank && stats.totalUsers > 0) {
      const percentage = (stats.attendanceRank / stats.totalUsers) * 100;

      if (stats.attendanceRank === stats.totalUsers) {
        completeRoasts.push(
          `🚨 EMERGENCY! 🚨 ${mention} is DEAD LAST (#${stats.totalUsers}/${stats.totalUsers}) and STILL trash talking! The CONFIDENCE! 😂`,
          `${mention} ranked #${stats.totalUsers} out of ${stats.totalUsers}! You're not just last, you're EPICALLY last! 🏆💩`,
          `LAST PLACE ${mention}! Congrats on your participation trophy! Should we frame your #${stats.totalUsers} rank?! 🖼️`,
          `Hoy ${mention}! LAST PLACE ka (#${stats.totalUsers}) tapos may lakas ka pang mang-bash?! Tutorial mo ba to?! 📖`,
          `**${nickname}'s rank:** #${stats.totalUsers}/${stats.totalUsers}! Even the leaderboard tried to delete you! 🗑️`,
          `BREAKING: ${mention} sets RECORD for being #${stats.totalUsers}! Worst attendance NA! 📰`,
        );
      } else if (percentage > 80) {
        completeRoasts.push(
          `${mention} ranked #${stats.attendanceRank}/${stats.totalUsers}! BOTTOM 20%! You're basically furniture! 🪑`,
          `#${stats.attendanceRank} out of ${stats.totalUsers}?! ${mention}, you're the BENCH! The ACTUAL bench! 🏗️`,
          `${mention} sa bottom tier (#${stats.attendanceRank}) pero ang attitude TOP TIER?! MISMATCHED! 🎭`,
          `Rank #${stats.attendanceRank}! ${mention}, you're closer to LAST than to FIRST! Think about that! 🤔`,
        );
      } else if (percentage > 50) {
        completeRoasts.push(
          `${mention} ranked #${stats.attendanceRank}/${stats.totalUsers}! BELOW AVERAGE confirmed! The math don't lie! 📐`,
          `${pick(openings.sarcastic)} Rank #${stats.attendanceRank}! Bottom half energy! 📉`,
          `**${nickname}'s #${stats.attendanceRank}**! Mas mataas pa yung price ng brown items sa rank mo! 💩`,
        );
      }
    }

    // Low attendance roasts
    if (stats.attendancePoints !== null && stats.attendancePoints < 50) {
      completeRoasts.push(
        `${mention} got **${stats.attendancePoints} attendance points**! Bro, AFK ka ba since CREATION?! 🌍`,
        `**${stats.attendancePoints} attendance**?! ${mention}, you're basically a GHOST MEMBER! Guild legends! 👻`,
        `${pick(openings.shock)} **${stats.attendancePoints} attendance points**! Present ka ba talaga EVER?! 🤔`,
        `**${nickname}'s ${stats.attendancePoints} attendance**! You exist in theory only! Schrodinger's member! 🐱`,
        `**${stats.attendancePoints} attendance**! ${mention}, even INACTIVE members show up more! 💤`,
        `Hoy ${mention}! **${stats.attendancePoints} attendance points** lang?! Absent king! Absent queen! 👑`,
      );
    }

    // ULTRA COMBO ROASTS (Multiple weaknesses)
    if (stats.points < 100 && stats.attendanceRank && stats.attendanceRank > stats.totalUsers * 0.7) {
      completeRoasts.push(
        `🌪️ PERFECT STORM! 🌪️ ${mention}: **${stats.points} points** + #${stats.attendanceRank} rank! DOUBLE BOTTOM TIER! The ULTIMATE failure! 💀`,
        `Wait... ${mention} got **${stats.points} points** AND rank #${stats.attendanceRank}?! That's IMPRESSIVELY bad! How?! 😂`,
        `**${nickname}'s resume:** ❌ Broke (**${stats.points}pts**) ❌ Last tier (#${stats.attendanceRank}) ❌ Still talking! CERTIFIED L! 📋`,
        `TANGINA! ${mention}! **${stats.points} points** + **#${stats.attendanceRank}** ranking = GUILD'S WEAKEST LINK! 🔗`,
        `${mention}: Points: **${stats.points}** 📉 | Rank: **#${stats.attendanceRank}** 📊 | Trash Talk: **∞** 💩 | Self-Awareness: **0** 🤡`,
        `Bro ${mention}, **${stats.points} points** + #${stats.attendanceRank} placement! You're SPEED-RUNNING to being kicked! 🏃`,
        `${mention} collected ALL the L's! **${stats.points}pts** + #${stats.attendanceRank} rank! L + L = 💀`,
      );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ASSEMBLY LINE - Build the perfect roast!
    // ═══════════════════════════════════════════════════════════════════════

    // Build a modular roast
    let opening = '';
    let statCall = '';
    let burn = '';

    // IMPROVED RANDOMIZATION: Mix complete roasts with modular roasts!
    // 40% chance to use complete roast (if available)
    // 60% chance to use mix-and-match system for more variety
    const useCompleteRoast = completeRoasts.length > 0 && Math.random() < 0.4;

    if (useCompleteRoast) {
      return pick(completeRoasts);
    }

    // Pick opening (randomized across 4 types)
    const openingType = pick(['shock', 'question', 'sarcastic', 'direct']);
    opening = pick(openings[openingType]);

    // IMPROVED: Collect ALL applicable stat callouts, then randomly pick one
    // This creates much more variety instead of always using the first match
    const availableStatCallouts = [];

    if (stats.points !== null && stats.points < 100) {
      availableStatCallouts.push(...lowPointsCallouts);
    }
    if (stats.points !== null && stats.points < 300) {
      availableStatCallouts.push(...medPointsCallouts);
    }
    if (stats.attendanceRank && stats.totalUsers > 0) {
      availableStatCallouts.push(...rankCallouts);
    }
    if (stats.attendancePoints !== null && stats.attendancePoints < 50) {
      availableStatCallouts.push(...attendanceCallouts);
    }

    // Pick stat callout from all available options
    if (availableStatCallouts.length > 0) {
      statCall = pick(availableStatCallouts);
    } else if (!stats.points && !stats.attendanceRank) {
      // No data - use dedicated roasts
      return pick([
        `${mention}? WHO?! 🤔 You're not even in my database! Bagong member ka lang at akala mo alam mo na lahat?! 👶`,
        `Can't find ${nickname}'s stats! 👻 Either you're SO bad the system deleted you OR you don't exist! 💀`,
        `${mention} not found! 404 ERROR! You're so irrelevant even my database gave up! 🗑️`,
        `Sino ba yan si ${mention}?! Wala sa records! Imaginary friend vibes! 🦄`,
        `${pick(openings.shock)} ${mention}, wala kang data pero ang lakas ng trash talk! Exist ka muna! 📊`,
      ]);
    } else {
      // Decent stats - can still use mix-and-match OR complete roast
      if (completeRoasts.length > 0 && Math.random() < 0.5) {
        return pick(completeRoasts);
      }
      // Decent stats but still trash talking
      return pick([
        `Oh wow! ${mention} got DECENT stats but TRASH personality! 😬 Money can't buy class! 💳`,
        `${nickname}'s stats: ✅ Good! Attitude: ❌ BASURA! 🗑️ Fix yourself! 🔧`,
        `Ayos naman stats ni ${mention} pero ugali?! NEGATIVE! 📉 Mag-reflect! 🪞`,
        `${mention} proving you can have GOOD stats and ZERO class! 🎩 Impressive! 👏`,
        `${pick(openings.sarcastic)} Good stats pero TOXIC! You're the whole RED FLAG! 🚩`,
        `${mention} got points but NO chill! 😤 Relax bro! !leaderboard won't make you #1 in LIFE! 🌎`,
      ]);
    }

    // Pick a burn
    burn = pick(burns);

    // IMPROVED COMBINATION: Randomly decide which components to use
    // 70% chance: Use all 3 components (opening + stat + burn)
    // 20% chance: Use 2 components (opening + stat OR stat + burn)
    // 10% chance: Use 1 component (just stat callout)
    const combinationRoll = Math.random();

    if (combinationRoll < 0.7) {
      // Use all 3 components
      return combine(opening, statCall, burn);
    } else if (combinationRoll < 0.9) {
      // Use 2 components (random choice)
      if (Math.random() < 0.5) {
        return combine(opening, statCall, ''); // opening + stat
      } else {
        return combine('', statCall, burn); // stat + burn
      }
    } else {
      // Use just stat callout (bold and standalone)
      return statCall;
    }
  }

  /**
   * Handle a conversational message (no command recognized)
   * @param {Message} message - Discord message
   * @param {string} content - Cleaned message content
   * @returns {string|null} Response message or null
   */
  async handleConversation(message, content) {
    try {
      const userId = message.author.id;
      // Use same name resolution as !mp command: nickname first, then username
      const username = message.member?.nickname || message.author.username;

      // Store conversation history for learning
      this.storeConversation(userId, content);

      // Try to match conversation patterns
      for (const [type, config] of Object.entries(CONVERSATION_PATTERNS)) {
        for (const pattern of config.patterns) {
          if (pattern.test(content)) {
            // Special handling for insults - RANDOMIZED roast selection!
            if (type === 'insult') {
              // ═══════════════════════════════════════════════════════════════
              // RANDOMIZED ROAST SYSTEM - Maximum Variety!
              // ═══════════════════════════════════════════════════════════════

              const random = Math.random();
              let roastType = null;
              let roast = null;

              // Determine roast type probabilities:
              // - 40% stat-based (if stats available, otherwise redistributed)
              // - 40% dynamic general
              // - 20% static responses

              // Try to get user stats
              let stats = null;
              if (this.sheetAPI) {
                stats = await this.getUserStats(username);
              }

              if (stats) {
                // Stats available - use all three roast types with probability
                if (random < 0.40) {
                  // 40% - Stat-based roast (personalized with their actual stats)
                  roastType = 'stat-based';
                  roast = this.generateStatBasedRoast(stats, message);
                  console.log(`🔥 [Trash Talk] ${username} getting STAT-BASED roast (40% chance)`);
                } else if (random < 0.80) {
                  // 40% - Dynamic general roast (time/day context)
                  roastType = 'dynamic';
                  roast = this.generateDynamicGeneralRoast(message);
                  console.log(`🔥 [Trash Talk] ${username} getting DYNAMIC roast (40% chance)`);
                } else {
                  // 20% - Static response (classic hardcoded roasts)
                  roastType = 'static';
                  roast = this.getRandomResponse(config.responses);
                  console.log(`🔥 [Trash Talk] ${username} getting STATIC roast (20% chance)`);
                }
              } else {
                // No stats available - redistribute probability between dynamic and static
                if (random < 0.70) {
                  // 70% - Dynamic general roast
                  roastType = 'dynamic';
                  roast = this.generateDynamicGeneralRoast(message);
                  console.log(`🔥 [Trash Talk] ${username} getting DYNAMIC roast (no stats, 70% chance)`);
                } else {
                  // 30% - Static response
                  roastType = 'static';
                  roast = this.getRandomResponse(config.responses);
                  console.log(`🔥 [Trash Talk] ${username} getting STATIC roast (no stats, 30% chance)`);
                }
              }

              console.log(`✨ [Trash Talk] Roast type: ${roastType}, User: ${username}`);
              return roast;
            }

            // Get random response for other patterns
            const response = this.getRandomResponse(config.responses);

            // Learn from this interaction
            this.learnFromConversation(userId, content, type);

            return response;
          }
        }
      }

      // No pattern matched - provide helpful fallback
      return this.getFallbackResponse(content);

    } catch (error) {
      console.error('❌ Error in conversational AI:', error);
      return null;
    }
  }

  /**
   * Store conversation in history for learning
   */
  storeConversation(userId, content) {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }

    const history = this.conversationHistory.get(userId);
    history.push({
      content,
      timestamp: Date.now(),
    });

    // Keep only last 10 messages per user
    if (history.length > 10) {
      history.shift();
    }
  }

  /**
   * Learn potential command patterns from conversation
   */
  learnFromConversation(userId, content, conversationType) {
    // If learning system is available, record this as a learning opportunity
    if (this.learningSystem) {
      // Mark as unrecognized so it gets tracked
      const key = content.toLowerCase().trim();

      if (!this.learningSystem.unrecognizedPhrases.has(key)) {
        this.learningSystem.unrecognizedPhrases.set(key, {
          phrase: content,
          count: 1,
          users: new Set([userId]),
          lastSeen: Date.now(),
          conversationType, // Tag with conversation type
        });
      }
    }
  }

  /**
   * Get random response from list
   */
  getRandomResponse(responses) {
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Fallback response when nothing matches
   */
  getFallbackResponse(content) {
    // Analyze content for potential intent with more sophisticated detection
    const hasQuestion = /\?|what|how|when|where|who|why|ano|paano|kailan|saan|sino|bakit|can\s+you|could\s+you|would\s+you/i.test(content);
    const hasPoints = /points?|pts?|balance|pera|money|credits|currency|wallet/i.test(content);
    const hasStatus = /status|update|info|balita|progress|current|now|state/i.test(content);
    const hasBid = /bid|taya|pusta|auction|offer|wager/i.test(content);
    const hasAttendance = /attendance|present|nandito|here|attend|late|absent|roll\s+call/i.test(content);
    const hasLeaderboard = /leaderboard|top|rank|ranking|leader|best|standings|score/i.test(content);
    const hasPrediction = /predict|spawn|when|next|timing|schedule/i.test(content);
    const hasHelp = /help|guide|tutorial|how\s+to|paano|confused|lost|don't\s+(?:know|understand)/i.test(content);
    const hasReport = /report|weekly|stats|statistics|summary|overview/i.test(content);

    // Multi-intent detection (prioritize more specific intents)
    if (hasHelp && (hasAttendance || hasBid || hasPoints)) {
      // User needs help with a specific feature
      if (hasAttendance) {
        return "Need help with attendance? 📊\n\n" +
               "**How to mark attendance:**\n" +
               "• In attendance threads, say: **\"present\"**, **\"here\"**, or **\"nandito\"**\n" +
               "• Late? Say: **\"late\"** or **\"huli\"**\n" +
               "• Can't attend? Say: **\"absent\"** or **\"wala\"**\n\n" +
               "Check active threads: **\"attendance status\"** or **\"@bot status\"** in admin-logs\n" +
               "View your record: **\"my attendance\"** or **\"attendance ko\"**";
      }
      if (hasBid) {
        return "Need help with bidding? 💰\n\n" +
               "**How to bid:**\n" +
               "• In auction threads: **\"bid 500\"** or **\"taya 500\"**\n" +
               "• Check balance: **\"my points\"** or **\"pts ko\"**\n" +
               "• Auction status: **\"bid status\"** or **\"ano status ng auction\"**\n\n" +
               "I understand natural language - just mention me and ask!";
      }
      if (hasPoints) {
        return "Need help with points? 💰\n\n" +
               "**Check your points:**\n" +
               "• Say: **\"my points\"**, **\"balance ko\"**, **\"ilang points ko\"**\n\n" +
               "**Earn points:**\n" +
               "• Attend guild events (tracked via attendance)\n" +
               "• Participate in raids and activities\n\n" +
               "**Use points:**\n" +
               "• Bid on items in auction threads\n" +
               "• The more you participate, the more you earn!";
      }
    }

    if (hasQuestion && hasAttendance) {
      return "Questions about attendance? 📊\n\n" +
             "• **Mark attendance**: Say \"present\", \"here\", \"nandito\" in attendance threads\n" +
             "• **Check status**: Say \"attendance status\" or \"@bot status\" in admin-logs\n" +
             "• **View your record**: Say \"my attendance\" or \"attendance ko\"\n" +
             "• **Late/Absent**: Say \"late\"/\"huli\" or \"absent\"/\"wala\"\n\n" +
             "I track everything automatically! 🤖";
    }

    if (hasQuestion && hasLeaderboard) {
      return "Want to see rankings? 🏆\n\n" +
             "Try these commands:\n" +
             "• **\"show leaderboards\"** or **\"top\"** - All rankings\n" +
             "• **\"top points\"** - Points leaderboard\n" +
             "• **\"top attendance\"** - Attendance rankings\n" +
             "• **\"rankings\"** or **\"who's leading\"** - Current standings\n\n" +
             "Compete with your guildmates! 🎮";
    }

    if (hasQuestion && hasPrediction) {
      return "Want spawn predictions? 🔮\n\n" +
             "I can predict boss spawn times! Try:\n" +
             "• **\"predict spawn\"** or **\"next spawn\"**\n" +
             "• **\"when is next boss\"** or **\"kailan spawn\"**\n" +
             "• **\"spawn schedule\"** or **\"boss timing\"**\n\n" +
             "I use historical data to predict spawn windows! 📊";
    }

    if (hasQuestion && hasReport) {
      return "Want to see reports? 📈\n\n" +
             "Available reports:\n" +
             "• **\"weekly report\"** - This week's summary\n" +
             "• **\"stats\"** - Guild statistics\n" +
             "• **\"attendance report\"** - Attendance overview\n\n" +
             "Stay informed about guild performance!";
    }

    if (hasPoints) {
      return "Want to check your points? 💰\n\n" +
             "Just say:\n" +
             "• **\"my points\"** or **\"balance ko\"**\n" +
             "• **\"how many points\"** or **\"ilang points ko\"**\n" +
             "• **\"show balance\"** or **\"check points\"**\n\n" +
             "Points are earned through attendance and participation!";
    }

    if (hasStatus) {
      return "Want to check status? 📊\n\n" +
             "Available status commands:\n" +
             "• **\"auction status\"** - Current auction info\n" +
             "• **\"attendance status\"** - Active threads (use in admin-logs)\n" +
             "• **\"bid status\"** - Your current bids\n" +
             "• **\"show leaderboards\"** - Rankings\n\n" +
             "Stay updated on guild activities!";
    }

    if (hasBid) {
      return "Want to bid on items? 💰\n\n" +
             "In auction threads, just say:\n" +
             "• **\"bid 500\"** or **\"taya 500\"**\n" +
             "• **\"offer 1000\"** or **\"1000 points\"**\n\n" +
             "Check your balance first: **\"my points\"**\n" +
             "See auction status: **\"bid status\"**";
    }

    if (hasAttendance) {
      return "Attendance-related? 📊\n\n" +
             "• **Mark present**: \"present\", \"here\", \"nandito\"\n" +
             "• **Check status**: \"attendance status\" (in admin-logs)\n" +
             "• **Your record**: \"my attendance\"\n\n" +
             "Just say it naturally - I'll understand!";
    }

    if (hasLeaderboard) {
      return "Check the leaderboards! 🏆\n\n" +
             "Just say:\n" +
             "• **\"show leaderboards\"** or **\"top\"**\n" +
             "• **\"rankings\"** or **\"who's leading\"**\n" +
             "• **\"top points\"** or **\"top attendance\"**\n\n" +
             "See where you stand among guildmates!";
    }

    // Generic fallback - enhanced with more guidance
    return "I'm your intelligent guild assistant! 🤖✨\n\n" +
           "**I can help with:**\n" +
           "• 📊 **Attendance** - \"present\", \"attendance status\", \"my attendance\"\n" +
           "• 💰 **Points** - \"my points\", \"balance ko\"\n" +
           "• 🎯 **Bidding** - \"bid 500\", \"bid status\"\n" +
           "• 🏆 **Rankings** - \"show leaderboards\", \"top\"\n" +
           "• 🔮 **Predictions** - \"predict spawn\", \"next boss\"\n" +
           "• 📈 **Reports** - \"weekly report\", \"stats\"\n\n" +
           "**Pro tip:** I understand natural language in English, Tagalog, and Taglish!\n" +
           "Just mention me (@bot) and ask naturally. Or type **!help** for all commands!";
  }

  /**
   * Get conversation insights for a user
   */
  getUserConversationHistory(userId) {
    return this.conversationHistory.get(userId) || [];
  }

  /**
   * Clear old conversation history
   */
  clearOldConversations() {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    for (const [userId, history] of this.conversationHistory.entries()) {
      // Remove messages older than 1 hour
      const filtered = history.filter(msg => now - msg.timestamp < ONE_HOUR);

      if (filtered.length === 0) {
        this.conversationHistory.delete(userId);
      } else {
        this.conversationHistory.set(userId, filtered);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { ConversationalAI, CONVERSATION_PATTERNS };
