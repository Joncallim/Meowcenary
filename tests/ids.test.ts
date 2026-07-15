import { describe, expect, it } from 'vitest';
import { isContentId, isUnlockId } from '../src/systems/ids';

describe('shared id grammar', () => {
  it.each([
    ['reinforced-vest', true],
    ['a', true],
    ['a1-b2', true],
    ['', false],
    ['Bad-Id', false],
    ['-leading', false],
    ['trailing-', false],
    ['double--dash', false],
    ['has space', false],
    ['character:starter', false],
  ])('isContentId(%j) === %j', (id, expected) => {
    expect(isContentId(id)).toBe(expected);
  });

  it.each([
    ['character:starter', true],
    ['card:reinforced-vest', true],
    ['character:cat', true],
    ['', false],
    ['no-colon', false],
    ['bad', false],
    ['character:', false],
    [':starter', false],
    ['character:Bad', false],
    ['character:starter:extra', false],
  ])('isUnlockId(%j) === %j', (id, expected) => {
    expect(isUnlockId(id)).toBe(expected);
  });
});
