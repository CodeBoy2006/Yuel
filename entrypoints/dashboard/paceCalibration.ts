import { analyzeEnglishText } from '../../src/analysis/english';

export interface PaceCalibrationOption {
  id: string;
  label: string;
}

export interface PaceCalibrationQuestion {
  id: string;
  prompt: string;
  correctOptionId: string;
  options: readonly PaceCalibrationOption[];
}

export interface PaceCalibrationMaterial {
  id: string;
  paragraphs: readonly string[];
  passage: string;
  wordCount: number;
  questions: readonly PaceCalibrationQuestion[];
}

interface PaceCalibrationMaterialDefinition {
  id: string;
  paragraphs: readonly string[];
  questions: readonly PaceCalibrationQuestion[];
}

const materialDefinitions: readonly PaceCalibrationMaterialDefinition[] = [
  {
    id: 'attention-budget',
    paragraphs: [
      'Many people read technical pages in short sessions, switching between notes, examples, and browser tabs. A useful reading estimate should not treat every visible paragraph as fully read at the same time. It should start with one realistic pace for the reader, then divide that attention across the text that is actually visible.',
      'When the tab is hidden, the page is idle, or the reader scrolls too quickly, the estimate should become cautious. When the reader stays with a stable viewport and several body paragraphs remain visible, the sample becomes more useful.',
      'Yuel uses this calibration passage to set an initial baseline for your personal reading pace. The result is not a grade. It is a local starting point that can improve later as real pages provide stronger evidence. Comprehension questions help decide how much weight to give the timing measurement. If the answers are solid, the observed pace can influence the baseline more. If the answers are weak, the timing sample is discarded and the system waits for future high confidence evidence. Over time, adaptive updates should move slowly, so one unusual page does not suddenly rewrite the baseline. This keeps daily word counts practical without rewarding fast skimming or accidental exposure.',
    ],
    questions: [
      {
        id: 'attention-budget-visibility',
        prompt: 'What should a useful reading estimate avoid?',
        correctOptionId: 'duplicate',
        options: [
          { id: 'duplicate', label: 'Duplicating visible paragraphs' },
          { id: 'notes', label: 'Using browser notes' },
          { id: 'local', label: 'Keeping data local' },
        ],
      },
      {
        id: 'attention-budget-confidence',
        prompt: 'When should timing receive more calibration weight?',
        correctOptionId: 'solid',
        options: [
          { id: 'solid', label: 'When answers are solid' },
          { id: 'hidden', label: 'When the tab is hidden' },
          { id: 'fast', label: 'When scrolling is fast' },
        ],
      },
      {
        id: 'attention-budget-adaptive',
        prompt: 'What improves the baseline after onboarding?',
        correctOptionId: 'samples',
        options: [
          { id: 'samples', label: 'High confidence real-page samples' },
          { id: 'skimming', label: 'Fast skimming exposure' },
          { id: 'opening', label: 'Opening unread pages' },
        ],
      },
    ],
  },
  {
    id: 'urban-trees',
    paragraphs: [
      'On hot summer afternoons, two streets in the same city can feel surprisingly different. A road lined with mature trees may be several degrees cooler than a nearby block covered by dark roofs, asphalt, and concrete. Leaves intercept sunlight before it reaches walls and pavement. Trees also release water through tiny openings in their leaves, and that evaporation removes heat from the surrounding air.',
      'Planting campaigns often celebrate the number of new trees placed in the ground, but the first day is only the beginning. Young trees need suitable soil, enough root space, regular water, and protection from traffic damage. A species that grows quickly in one neighborhood may struggle in another because of salt, wind, limited rainfall, or underground utilities. Planting many trees of the same species can also create a shared weakness if a disease or insect arrives.',
      'For these reasons, successful urban forestry is measured over years rather than at a single ceremony. Planners track survival, canopy growth, maintenance costs, and whether shade reaches the people who need it most. Residents can help by reporting damaged trees and caring for new plantings, while city teams provide long-term pruning and replacement. The goal is not simply to make a map look greener. It is to create a healthier network of shade that continues working through hotter summers.',
    ],
    questions: [
      {
        id: 'urban-trees-cooling',
        prompt: 'How do trees help cool a street?',
        correctOptionId: 'shade-water',
        options: [
          { id: 'shade-water', label: 'They provide shade and release water' },
          { id: 'paint', label: 'They paint nearby roofs a lighter color' },
          { id: 'traffic', label: 'They permanently stop street traffic' },
        ],
      },
      {
        id: 'urban-trees-diversity',
        prompt: 'Why can planting one species everywhere be risky?',
        correctOptionId: 'shared-weakness',
        options: [
          { id: 'shared-weakness', label: 'A disease could affect many trees at once' },
          { id: 'slow-count', label: 'It makes the planting count harder to publish' },
          { id: 'extra-shade', label: 'It creates too much shade on the first day' },
        ],
      },
      {
        id: 'urban-trees-success',
        prompt: 'How should a planting program measure success?',
        correctOptionId: 'long-term',
        options: [
          { id: 'long-term', label: 'By tracking survival and canopy growth over years' },
          { id: 'ceremony', label: 'By counting guests at the planting ceremony' },
          { id: 'map-color', label: 'By making a map look green immediately' },
        ],
      },
    ],
  },
  {
    id: 'sleep-and-memory',
    paragraphs: [
      'Sleep is sometimes described as a period when the brain switches off, but research suggests that important work continues after a person closes their eyes. During the day, new facts and skills leave temporary patterns of activity in the brain. During sleep, some of those patterns are strengthened, reorganized, or connected with older knowledge. This process is one reason a difficult idea can feel clearer the morning after studying it.',
      'Experiments often compare people who learn the same material but spend the following hours differently. A group that sleeps usually remembers more than a group that remains awake for an equally long period. The advantage does not mean that sleep records everything perfectly. Memories that were barely understood, never practiced, or mixed with strong distractions may still fade. Sleep supports learning, but it cannot replace careful attention and repeated retrieval.',
      'Timing also matters. Reviewing important material shortly before a normal sleep period can reduce the amount of interference from new daytime experiences. Short naps may help in some situations, although their effects depend on length, timing, and the stage of sleep reached. A practical study routine therefore combines focused practice, breaks, and sufficient nighttime sleep. Staying awake longer may create more study minutes on the clock, yet those extra minutes are not always converted into durable knowledge.',
    ],
    questions: [
      {
        id: 'sleep-memory-work',
        prompt: 'What can happen to new memories during sleep?',
        correctOptionId: 'strengthened',
        options: [
          { id: 'strengthened', label: 'They can be strengthened and reorganized' },
          { id: 'deleted', label: 'They are automatically deleted' },
          { id: 'printed', label: 'They are printed as exact visual copies' },
        ],
      },
      {
        id: 'sleep-memory-limit',
        prompt: 'What can sleep not replace?',
        correctOptionId: 'practice',
        options: [
          { id: 'practice', label: 'Careful attention and repeated practice' },
          { id: 'alarm', label: 'Setting an alarm for the morning' },
          { id: 'breakfast', label: 'Eating breakfast after waking' },
        ],
      },
      {
        id: 'sleep-memory-routine',
        prompt: 'What routine does the passage recommend?',
        correctOptionId: 'balanced',
        options: [
          { id: 'balanced', label: 'Focused practice, breaks, and sufficient sleep' },
          { id: 'overnight', label: 'Studying continuously through the night' },
          { id: 'naps-only', label: 'Replacing all study sessions with naps' },
        ],
      },
    ],
  },
  {
    id: 'transit-maps',
    paragraphs: [
      'A transit map is not a small photograph of a city. Its main job is to help travelers understand how lines connect, where they can change trains, and how many stops remain before a destination. To make those relationships clear, designers often straighten winding routes, enlarge crowded centers, and place stations at regular intervals. The resulting diagram may be geographically inaccurate while still being extremely useful.',
      'Simplification creates tradeoffs. If every curve and street is preserved, the map can become difficult to scan quickly. If geography is removed too aggressively, a traveler may misunderstand walking distance or choose the wrong exit. Rivers, coastlines, major parks, and a few important landmarks can provide orientation without overwhelming the network. Consistent colors and station symbols also reduce the amount of text that must be read during a hurried trip.',
      'Good map design is tested with real tasks rather than judged only by appearance. Researchers may ask unfamiliar users to plan a transfer, identify the direction of travel, or compare two possible routes. Mistakes reveal where spacing, labels, or visual hierarchy need improvement. Digital maps can add live arrival times and accessibility information, but they still depend on a clear underlying structure. Whether printed on a wall or displayed on a phone, the best transit map helps a person make the next decision with confidence.',
    ],
    questions: [
      {
        id: 'transit-maps-purpose',
        prompt: 'What is the main job of a transit map?',
        correctOptionId: 'connections',
        options: [
          { id: 'connections', label: 'Showing routes, stops, and connections clearly' },
          { id: 'photograph', label: 'Reproducing every street like a photograph' },
          { id: 'advertising', label: 'Displaying as many advertisements as possible' },
        ],
      },
      {
        id: 'transit-maps-landmarks',
        prompt: 'Why are a few landmarks sometimes included?',
        correctOptionId: 'orientation',
        options: [
          { id: 'orientation', label: 'They help travelers keep their orientation' },
          { id: 'decoration', label: 'They fill every empty part of the map' },
          { id: 'accuracy', label: 'They make every route geographically exact' },
        ],
      },
      {
        id: 'transit-maps-testing',
        prompt: 'How should designers test a map?',
        correctOptionId: 'tasks',
        options: [
          { id: 'tasks', label: 'By asking users to complete realistic travel tasks' },
          { id: 'colors', label: 'By counting how many colors it contains' },
          { id: 'memory', label: 'By asking designers to draw it from memory' },
        ],
      },
    ],
  },
];

export const PACE_CALIBRATION_MATERIALS: readonly PaceCalibrationMaterial[] =
  materialDefinitions.map((material) => {
    const passage = material.paragraphs.join('\n\n');
    return {
      ...material,
      passage,
      wordCount: analyzeEnglishText(passage).wordCount,
    };
  });

export function selectRandomPaceCalibrationMaterial(
  random: () => number = Math.random,
): PaceCalibrationMaterial {
  const fallback = PACE_CALIBRATION_MATERIALS[0];
  if (!fallback) {
    throw new Error('At least one pace calibration material is required.');
  }

  const randomValue = random();
  const boundedRandomValue = Number.isFinite(randomValue)
    ? Math.min(1 - Number.EPSILON, Math.max(0, randomValue))
    : 0;
  const index = Math.floor(boundedRandomValue * PACE_CALIBRATION_MATERIALS.length);
  return PACE_CALIBRATION_MATERIALS[index] ?? fallback;
}
