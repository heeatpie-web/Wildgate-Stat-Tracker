# OCR Training Sample 001 — Crew Hub

**Source:** `raw_capture_2026-02-08T02-55-50-174Z.png`
**Screen Type:** Crew Hub
**Game Mode:** Artifact Brawl (3-crew match)

---

## Ground Truth

### My Crew
- **Ship Name:** DODGE THE BULLET
- **Players:**
  - AlixThus (user/self)
  - Xiphorix
  - Germ Dawg Mill

### Enemy Crew 1
- **Ship Name:** POCO DIABLO
- **Ship Label Color:** Red
- **Players:**
  - Two t0ne (note: zero not O)
  - NigthmareGMC (note: missing 'h' — it's Nigtmare not Nightmare)
  - Ogurl_ Cap (note: underscore + space before Cap)

### Enemy Crew 2
- **Ship Name:** SHIPPY MCSHIPFACE
- **Ship Label Color:** Cyan/Teal
- **Players:**
  - 7VERTIGO (starts with number)
  - Gaffinator0048 (number suffix)
  - BigDustyLuke (mixed case)
  - DISCOCHOWDER22 (all caps + number suffix)

---

## OCR Challenges in This Screenshot

1. **Zero vs O:** "Two t0ne" uses a zero — OCR may read as "Two tOne"
2. **Misspelled gamertag:** "NigthmareGMC" — missing 'h', OCR might "correct" to "NightmareGMC"
3. **Underscore + space:** "Ogurl_ Cap" — unusual spacing around underscore
4. **Leading digit:** "7VERTIGO" — starts with number, OCR may drop it
5. **ALL CAPS names:** "DISCOCHOWDER22" — OCR may introduce mixed case
6. **Ship name detection:** Ship names appear as colored labels under each enemy player
7. **My ship name** appears as a header: "DODGE THE BULLET's Crew"
8. **Party labels:** "PARTY VOICE" badges overlay player names — OCR must ignore these
9. **Icon interference:** Voice/chat/diamond icons between player entries
10. **Two distinct teams** separated by ship label color (red vs cyan)
