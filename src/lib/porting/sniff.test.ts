import { describe, expect, it } from 'vitest'
import { purposeOfJson } from './sniff'

describe('what a dropped .json is', () => {
  it('reads the format field, or the GeoJSON shape, and refuses the rest', () => {
    expect(purposeOfJson('{"format":"tower-studio-project@1"}')).toBe('project')
    expect(purposeOfJson('﻿{"format":"tower-studio-phase@1"}')).toBe('package')
    expect(purposeOfJson('{"format":"tower-studio-node@1","id":"community.x"}')).toBe('tool')
    expect(purposeOfJson('{"type":"Feature","geometry":{"type":"Polygon"}}')).toBe('site')
    expect(purposeOfJson('{"type":"Point"}')).toBe(null)
    expect(purposeOfJson('[1,2]')).toBe(null)
    expect(purposeOfJson('not json')).toBe(null)
  })
})
