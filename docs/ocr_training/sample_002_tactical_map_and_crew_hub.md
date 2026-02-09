# OCR Training Sample 002 — Tactical Map + Crew Hub (Same Match)

**Sources:**
- Tactical Map: `raw_capture_2026-02-07T02-03-06-117Z.png`
- Crew Hub 1: `raw_capture_2026-02-07T02-03-39-482Z.png`
- Crew Hub 2: `raw_capture_2026-02-07T02-04-10-350Z.png`

**Game Mode:** Artifact Brawl (4-crew match)

---

## Ground Truth

### My Team
- **Ship Name:** LIZARD LIZARD LIZARD
- **Ship Type:** Privateer
- **Battle Ship stats:** Crew Size 4, Health 100, 6 Turrets in forward deck, Projectiles fire at 2x velocity
- **Players:**
  - AlixThus (user/self, PARTY leader)
  - Nemo Sophus (TEAM)
  - Oguri_ Cap (TEAM)
  - Proventure18 (TEAM)

### Enemy Crew 1
- **Ship Name:** S.S. BAD DECISIONS
- **Ship Label Color:** Red
- **Ship Type:** Hunter
- **Players:**
  - Dok my Wok
  - TheF16
  - River.Banks
  - alxndr008

### Enemy Crew 2
- **Ship Name:** SECRET HORSE
- **Ship Label Color:** Orange
- **Ship Type:** Privateer
- **Players:**
  - Thepurplestraw
  - frothymug
  - TheWildgater (AKA Amberlockee — user notes this is an alternate name)
  - Tone

### Enemy Crew 3
- **Ship Name:** GUN JUMPERS
- **Ship Label Color:** Yellow
- **Ship Type:** Hunter
- **Players:**
  - Flaugment
  - Limler
  - ExoticMonkey
  - AlphaQ

### Spectators (visible in Crew Hub screenshot 1)
- **Team Label:** "FIEND OR FOE" (cyan/teal label)
- **Color:** Black (indicates spectators, NOT an enemy team)
- **Players:**
  - Itamare84
  - GoblinaTTV

### Known Hazards & Features (Reach Modifiers)
- Weapon Artifact
- Ancient Vault
- Rogue Turrets
- Easy Loot
- Legion Patrols
- Low Latitude Fog
- Few Asteroids
- Gloaming Expanse
- Few Ships

### Map Features (from tactical map)
- POI counts: 5 Artifact, 5 Special Loot, 50 Resources
- Map icons visible: Artifact, Special Loot, Wildgate, Resources
- Location marker: "Lucky Docks" at approximately D3-D4

---

## OCR Challenges in These Screenshots

### Tactical Map Challenges
1. **Ship type extraction:** Ship types ("PRIVATEER", "HUNTER") appear below ship names on colored banners
2. **Reach modifiers list:** Bulleted list on right side — OCR must extract all items
3. **POI counts:** Small icons with numbers at bottom-left (5, 5, 50) — easy to misread
4. **Ship stats box:** Dense text block with mixed formatting (bold headers, bullet points)
5. **"YOUR SHIP" label** vs "ENEMY SHIPS" — structural context for team assignment
6. **Team color → ship mapping:** Colors of enemy ship banners (red/orange/yellow) indicate teams

### Crew Hub Challenges
7. **Scrolled list:** Enemy crews list is too long for one screen — requires TWO screenshots to see all players
8. **Spectator detection:** "FIEND OR FOE" team with BLACK/dark label = spectators, not enemies. OCR must not treat these as opponents.
9. **Team label overlap:** "S.S. BAD DECISIONS" text wraps/truncates on the red labels
10. **Repeated ship name:** "LIZARD LIZARD LIZARD" — OCR may deduplicate the repeated word
11. **Period in name:** "River.Banks" — period may be dropped or treated as sentence boundary
12. **Case sensitivity:** "alxndr008" is all lowercase — OCR may capitalize
13. **"TheWildgater" vs "Amberlockee":** Player has an AKA — OCR can only see displayed name
14. **4-team match** — more complex than sample 001's 3-team match
15. **Bottom-right notification:** Discord/game notification overlay in crew hub 2 ("ltzamad is playing HELLDIVERS 2") — OCR should ignore this
