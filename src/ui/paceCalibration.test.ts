import { describe, expect, it, vi } from 'vitest';

import {
  PACE_CALIBRATION_MATERIALS,
  selectRandomPaceCalibrationMaterial,
} from '../../entrypoints/dashboard/paceCalibration';

describe('pace calibration materials', () => {
  it('provides several bounded passages with valid comprehension questions', () => {
    expect(PACE_CALIBRATION_MATERIALS.length).toBeGreaterThanOrEqual(4);

    const materialIds = new Set<string>();
    const questionIds = new Set<string>();
    for (const material of PACE_CALIBRATION_MATERIALS) {
      expect(materialIds.has(material.id)).toBe(false);
      materialIds.add(material.id);
      expect(material.paragraphs.length).toBeGreaterThanOrEqual(3);
      expect(material.wordCount).toBeGreaterThanOrEqual(200);
      expect(material.wordCount).toBeLessThanOrEqual(260);
      expect(material.questions).toHaveLength(3);

      for (const question of material.questions) {
        expect(questionIds.has(question.id)).toBe(false);
        questionIds.add(question.id);
        expect(question.options).toHaveLength(3);
        expect(question.options.some((option) => option.id === question.correctOptionId)).toBe(true);
      }
    }
  });

  it('maps the random range across the full material pool', () => {
    PACE_CALIBRATION_MATERIALS.forEach((material, index) => {
      const randomValue = (index + 0.5) / PACE_CALIBRATION_MATERIALS.length;
      expect(selectRandomPaceCalibrationMaterial(() => randomValue)).toBe(material);
    });
  });

  it('bounds invalid random values without selecting outside the pool', () => {
    const random = vi.fn()
      .mockReturnValueOnce(Number.NaN)
      .mockReturnValueOnce(-1)
      .mockReturnValueOnce(1);

    expect(selectRandomPaceCalibrationMaterial(random)).toBe(PACE_CALIBRATION_MATERIALS[0]);
    expect(selectRandomPaceCalibrationMaterial(random)).toBe(PACE_CALIBRATION_MATERIALS[0]);
    expect(selectRandomPaceCalibrationMaterial(random)).toBe(PACE_CALIBRATION_MATERIALS.at(-1));
  });
});
