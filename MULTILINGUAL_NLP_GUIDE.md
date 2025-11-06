# 🌏 Multilingual NLP Guide

## Elysium Bot - Natural Language Support

The Elysium bot now supports **English**, **Tagalog**, and **Taglish** (code-switching) for all commands!

---

## 🎯 **How It Works**

Instead of typing exact commands like `!bid 500`, you can now say things naturally:

- **English**: "bid 500"
- **Tagalog**: "taya 500"
- **Taglish**: "bid ko 500"

The bot will automatically detect your language and respond accordingly!

---

## 📋 **Supported Commands**

### 💰 **Bidding Commands** (Auction Threads)

| English | Tagalog | Taglish |
|---------|---------|---------|
| bid 500 | taya 500 | bid ko 500 |
| offer 500 | alok ko 500 | bid na 500 |
| place bid 500 | bayad 500 | 500 lang |
| bidding 500 | lagay 500 | mag-bid ng 500 |
| 500 points | taasan 500 | 500 na lang |

**Examples:**
- "i want to bid 500" → `!bid 500`
- "taya ko 500" → `!bid 500`
- "bid na 1000" → `!bid 1000`
- "500 lang" → `!bid 500`

---

### 💎 **Points Queries**

| English | Tagalog | Taglish |
|---------|---------|---------|
| my points | points ko ilang | my points ilang |
| how many points | ilang points ko | check ko points |
| check my points | magkano points ko | show points ko |
| what's my balance | balance ko | gaano karami points ko |
| show my points | tignan points ko | points ko how many |

**Examples:**
- "how many points do I have?" → `!mypoints`
- "ilang points ko?" → `!mypoints`
- "check ko points" → `!mypoints`
- "pera ko" (slang) → `!mypoints`

---

### ✅ **Attendance Commands**

| English | Tagalog | Taglish |
|---------|---------|---------|
| present | nandito | present po |
| i'm here | nandito po | here na |
| attending | andito ako | attending po |
| check in | dumating na | nandito na |
| mark me present | sumali | present naman |

**Examples:**
- "present" → `!present` (marks attendance)
- "nandito po" → `!present`
- "here na" → `!present`
- "dumating na ako" → `!present`

---

### 📊 **Leaderboard Commands**

| English | Tagalog | Taglish |
|---------|---------|---------|
| show leaderboard | tignan ranking | show ranking |
| top rankings | sino nangunguna | sino ang top |
| who's on top | listahan | pakita leaderboard |
| attendance leaderboard | attendance ranking | attendance listahan |
| bidding leaderboard | bidding ranking | bidding listahan |

**Examples:**
- "show me the leaderboard" → `!leaderboard`
- "sino nangunguna?" → `!leaderboard`
- "tignan attendance ranking" → `!leaderboardattendance`
- "sino pinakamarami bidding" → `!leaderboardbidding`

---

### 📋 **Status & Queue**

| English | Tagalog | Taglish |
|---------|---------|---------|
| auction status | ano meron | status na |
| what's happening | ano nangyayari | ano update |
| show status | saan na | kumusta auction |
| show queue | tignan queue | show queue |
| what's in the queue | ano nasa queue | listahan ng items |

**Examples:**
- "what's the auction status?" → `!bidstatus`
- "ano meron?" → `!bidstatus`
- "saan na auction?" → `!bidstatus`
- "tignan queue" → `!queuelist`

---

### 🎮 **Admin Auction Commands**

#### Start Auction
| English | Tagalog | Taglish |
|---------|---------|---------|
| start auction | simula auction | start na auction |
| begin auction | umpisa auction | simulan na |
| launch auction | umpisahan auction | begin na |

#### Pause/Resume
| English | Tagalog | Taglish |
|---------|---------|---------|
| pause auction | hinto muna | pause muna |
| hold auction | tigil sandali | hold lang |
| resume auction | tuloy auction | resume na |
| continue auction | ituloy | continue na |

#### Stop/Cancel
| English | Tagalog | Taglish |
|---------|---------|---------|
| stop auction | tigil na | stop na |
| end auction | tapos na | end na |
| cancel auction | kanselahin auction | cancel na |

#### Extend Time
| English | Tagalog | Taglish |
|---------|---------|---------|
| extend 5 minutes | dagdag 5 minuto | extend ng 5 mins |
| add 5 minutes | palawakin oras 5 | dagdag oras 5 |

#### Skip/Cancel Item
| English | Tagalog | Taglish |
|---------|---------|---------|
| skip item | laktaw item | skip na |
| next item | sunod na | next item |
| cancel item | kanselahin item | cancel ito |
| remove item | tanggalin item | wag na ito |

---

### 🤖 **Intelligence Commands** (Admin)

#### Price Prediction
| English | Tagalog | Taglish |
|---------|---------|---------|
| predict price for item | magkano presyo ng item | predict ng price |
| how much is item | tantiya ng presyo | estimate price |
| estimate price | taya ng item | magkano item |

**Example:**
- "predict price for Dragon Sword" → `!predictprice Dragon Sword`
- "magkano presyo ng Dragon Sword" → `!predictprice Dragon Sword`

#### Engagement Analysis
| English | Tagalog | Taglish |
|---------|---------|---------|
| analyze engagement | suriin engagement | analyze guild |
| check engagement | tignan engagement | check engagement |
| show engagement | pakita engagement | kamusta engagement |

**Example:**
- "analyze guild engagement" → `!analyzeengagement`
- "suriin ang guild" → `!analyzeengagement`

#### Member Analysis
| English | Tagalog | Taglish |
|---------|---------|---------|
| check engagement for @user | tignan engagement ni user | check si user |
| how engaged is @user | gaano kaactive si user | analyze si user |

**Example:**
- "check engagement for @Juan" → `!engagement @Juan`
- "gaano kaactive si @Juan" → `!engagement @Juan`

#### Anomaly Detection
| English | Tagalog | Taglish |
|---------|---------|---------|
| detect anomalies | hanapin anomaly | check anomaly |
| check fraud | tignan kung may daya | check fraud |
| suspicious activity | kaduda-duda activity | suspicious na |

---

### ❓ **Help Commands**

| English | Tagalog | Taglish |
|---------|---------|---------|
| help | tulong | help please |
| commands | ano commands | show commands |
| what can you do | ano pwede | ano magagawa |
| how do I | paano ba | paano gamitin |
| show me | pakita ng commands | show help |

**Examples:**
- "help" → Shows help menu
- "tulong" → Shows help menu
- "paano ba?" → Shows help menu
- "ano pwede?" → Shows help menu

---

## 🎨 **Language Detection**

The bot automatically detects which language you're using and responds in the same language:

### English Response
**You**: "how many points do I have?"
**Bot**: "💡 *Checking your points...*"

### Tagalog Response
**You**: "ilang points ko?"
**Bot**: "💡 *Tinitingnan ang points mo...*"

### Taglish Response
**You**: "check ko points"
**Bot**: "💡 *Checking points mo...*"

---

## 💡 **Tips & Tricks**

### 1. **Casual Phrases Work!**
You don't need perfect grammar. The bot understands:
- "500 lang" (just 500)
- "pera ko" (my money/points - slang)
- "ano meron" (what's up)
- "wag na ito" (never mind this)

### 2. **Mix Languages Freely**
Code-switching is natural! Use:
- "bid ko 1000" (my bid 1000)
- "check points ko" (check my points)
- "present na po" (present already)

### 3. **Common Particles**
Filipino particles like **po**, **na**, **ba**, **lang**, **naman** are recognized:
- "nandito po" (I'm here, respectfully)
- "500 lang" (just 500)
- "paano ba?" (how is it?)
- "present naman" (I'm present too)

### 4. **Silent Bidding**
In auction threads, the bot won't spam confirmations:
- "taya 500" → Bid placed silently ✅
- "bid ko 1000" → Bid placed silently ✅

---

## 🚫 **Where NLP Works**

### ✅ **Enabled:**
- **Admin Logs Channel** - All commands work
- **Auction Threads** - Bidding and status commands
- **Attendance Threads** - Present commands

### ❌ **Disabled:**
- **Guild Chat** - To avoid interfering with casual conversation
- **DMs** - Not monitored

---

## 📝 **Examples in Action**

### Example 1: Auction Bidding
```
Member: taya ko 500
Bot: [Bid placed silently]
```

### Example 2: Check Points
```
Member: ilang points ko?
Bot: 💡 *Tinitingnan ang points mo...*
     You have 850 attendance points and 600 bidding points.
```

### Example 3: Attendance
```
Member: nandito po
Bot: ✅ *Nag-mark ng attendance...*
     [Screenshot verification pending]
```

### Example 4: Admin Commands
```
Admin: simula auction
Bot: 💡 *Naintindihan bilang `!startauction`*
     Starting auction session...
```

### Example 5: Leaderboard
```
Member: sino nangunguna sa attendance?
Bot: 📊 *Pinapakita ang ranking...*
     [Shows attendance leaderboard]
```

---

## 🔧 **Technical Details**

### Pattern Matching
- Uses **regex patterns** for flexible matching
- Supports **60+ Tagalog phrases** per command
- Handles **typos** and **variations** gracefully

### Language Detection Algorithm
1. Counts Tagalog-specific keywords (ako, ko, ang, ng, po, etc.)
2. **2+ keywords** = Pure Tagalog
3. **1 keyword** = Taglish (code-switching)
4. **0 keywords** = English

### Confidence Threshold
- Minimum **60% similarity** required for fuzzy matching
- Exact pattern matches have **100% confidence**

---

## 🎯 **Quick Reference**

### Most Common Commands

| Task | English | Tagalog | Taglish |
|------|---------|---------|---------|
| Place bid | bid 500 | taya 500 | bid ko 500 |
| Check points | my points | ilang points ko | points ko |
| Mark present | present | nandito po | present na |
| Show leaderboard | leaderboard | ranking | show ranking |
| Check status | status | ano meron | status na |
| Get help | help | tulong | help po |

---

## 🌟 **Pro Tips for Guild Members**

1. **Be natural!** The bot understands conversational Filipino.
2. **Use shortcuts!** "500 lang" is faster than typing full commands.
3. **Don't overthink!** If you'd say it naturally, the bot will understand.
4. **Mix languages freely!** Filipino brains naturally code-switch - so does the bot.

---

## 🆘 **Troubleshooting**

### Bot not responding?
- Check you're in the right channel (admin logs, auction thread)
- Make sure you didn't start with `!` (that's for direct commands)
- Try rephrasing or use the exact command syntax

### Wrong command detected?
- Be more specific (e.g., "attendance leaderboard" vs just "leaderboard")
- Use the direct command with `!` prefix for 100% accuracy

---

## 📚 **Full Command List**

For the complete list of commands with `!` prefix, type:
- `!help` (English)
- `tulong` (Tagalog)
- `help po` (Taglish)

---

**Happy bidding! Masayang pag-bid! Happy bidding na!** 🎉
