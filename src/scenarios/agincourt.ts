import type { ScenarioDefinition } from "./types";

export const AGINCOURT: ScenarioDefinition = {
  id: "agincourt",
  version: 1,
  title: "Agincourt · 1415",
  description:
    "An autumn battlefield between woods. Witness the battle, or carry arrows from the supply train to the English archers.",
  sources: [
    {
      id: "prisoners",
      title: "Rémy Ambühl: the fate of Agincourt’s prisoners",
      url: "https://www.agincourt600.com/2015/06/09/how-many-french-prisoners-survived-the-massacre-which-took-place-at-the-battle-of-agincourt/",
    },
    {
      id: "soldiers",
      title: "Medieval Soldier: English army in 1415",
      url: "https://medievalsoldier.org/about/agincourt/the-english-army-in-1415/english-army-table/",
    },
    {
      id: "arms",
      title: "College of Arms: The Battle of Agincourt",
      url: "https://www.college-of-arms.gov.uk/news-grants/news/item/119-the-battle-of-agincourt",
    },
    {
      id: "armour",
      title: "Royal Armouries: The Hundred Years’ War",
      url: "https://royalarmouries.org/objects-and-stories/stories/the-hundred-years-war-1337-1453",
    },
  ],
  modes: ["observe", "participate", "watch"],
  durations: [15, 30, 45],
  routes: [
    {
      id: "perimeter",
      points: [
        [0, 215],
        [-215, 160],
        [-230, -160],
        [0, -240],
        [230, -160],
        [215, 160],
      ],
      pickup: 0,
      delivery: 0.5,
    },
    {
      id: "supply",
      points: [
        [0, 220],
        [-105, 185],
        [-105, 90],
        [0, 70],
        [105, 90],
        [105, 185],
      ],
      pickup: 0,
      delivery: 0.5,
    },
  ],
  modeRoutes: {
    observe: "perimeter",
    participate: "supply",
    watch: "perimeter",
  },
  assets: [
    {
      id: "palette",
      path: "assets/scenarios/agincourt/palette.json",
      attribution:
        "Original Infinibike procedural scenery; no third-party art.",
    },
  ],
  requiredAssets: ["palette"],
  timeline: [
    {
      id: "assembly",
      at: 0,
      title: "Between the woods",
      caption:
        "25 October 1415. Henry V’s army faces the French. This landscape and its formations are a schematic reconstruction, not a surveyed battlefield.",
      focus: [0, 0],
      sources: ["arms", "soldiers"],
      confidence: "Date and combatants documented; layout reconstructed.",
    },
    {
      id: "advance",
      at: 0.15,
      title: "The English advance",
      caption:
        "The English move forward. Archers prepare behind stakes. Exact positions and the timing shown here are reconstructed.",
      focus: [-75, 35],
      sources: ["armour"],
      confidence:
        "Broad tactical reconstruction; formation geometry uncertain.",
    },
    {
      id: "arrows",
      at: 0.3,
      title: "The opening assault",
      caption:
        "Longbows and defensive stakes confront the mounted attack. The soldiers shown represent formations, not a literal headcount.",
      focus: [-80, -20],
      sources: ["armour"],
      confidence: "Interpretive representation of the opening fighting.",
    },
    {
      id: "pressure",
      at: 0.5,
      title: "The press of battle",
      caption:
        "French men-at-arms close with the English line. Armour, fatigue, ground conditions and crowded formations all matter; arrows alone do not explain the battle.",
      focus: [0, 20],
      sources: ["armour", "arms"],
      confidence: "Broad sequence; relative causes remain debated.",
    },
    {
      id: "crisis",
      at: 0.7,
      title: "A bitter struggle",
      caption:
        "Fighting continues at close quarters. This compressed reconstruction cannot reproduce every action or experience on the field.",
      focus: [50, 25],
      sources: ["arms"],
      confidence: "Documented fighting; precise choreography invented.",
    },
    {
      id: "aftermath",
      at: 0.88,
      title: "The aftermath",
      caption:
        "Historically, the English won. Many French prisoners were killed on Henry’s orders during the battle. That violence is acknowledged here without graphic depiction; its timing and circumstances are debated.",
      focus: [0, 0],
      sources: ["armour", "prisoners"],
      confidence: "Historical outcome; chronology and interpretation disputed.",
    },
  ],
  checkpoints: [0.3, 0.5, 0.7, 0.88],
  branches: {
    victory: {
      title: "English victory",
      description:
        "Your supply effort sustained the archers. The winner matches history; your delivery mission and its causal role are invented.",
    },
    "costly-victory": {
      title: "Alternate history: costly English victory",
      description:
        "The supported formation faltered before recovering. This supply-driven account is fictional; the historical battle was an English victory.",
    },
    defeat: {
      title: "Alternate history: English defeat",
      description:
        "In this fictional branch, the English line gives way. Historically, the English won; your supply score is not a historical explanation.",
    },
  },
};
