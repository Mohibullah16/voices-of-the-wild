// Narration script. Changing a line changes its hash, so `npm run narration` regenerates only that line.
// Keep the total under 1,200 characters (tags included; they are billed).

/** Brian: deep, velvety, comforting. A stock voice already in the account (also cast as Dusk the sunset). */
export const NARRATOR = { id: "nPczCjzI2devNBz1zQrb", name: "Brian" } as const;
export const NARRATION_MODEL = "eleven_v4";

export const NARRATION = [
  {
    id: "idea",
    text: "[warmly] This is Voices of the Wild. Point your phone at something outside: a tree, a crow, a bus. The phone works out who it is, and it talks back.",
  },
  {
    id: "game",
    text: "Then it becomes a trail: three to five quests a day, one after another. Find something and listen. Then walk five hundred steps, counted by your phone, to unlock the next. Plus streaks, and rare gold Elders.",
  },
  {
    id: "stack1",
    text: "Here's the stack. The photo goes into EmbeddingGemma 2, Google's open, multimodal embedding model, running right in the browser.",
  },
  {
    id: "stack2",
    text: "It becomes seven hundred and sixty-eight numbers, matched against character descriptions embedded ahead of time. Not sure? A guardian asks for a closer look.",
  },
  {
    id: "stack3",
    text: "Every voice is pre-recorded: Eleven v4 for the Elders, open-source Kokoro for the rest. After setup, nothing touches the network. Your photos never leave the phone.",
  },
  {
    id: "proof",
    text: "On two hundred and thirty-two real photos, the right character ranked first eighty-nine percent of the time. When it names someone, it's right ninety-three percent of the time.",
  },
  { id: "cta", text: "[softly] Everything outside has something to say. Go find out what." },
] as const;

export type NarrationId = (typeof NARRATION)[number]["id"];
