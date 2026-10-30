import { describe, expect, it } from 'vitest'
import { cfiSortKey, compareCfi } from './cfi.ts'

describe('CFI ordering', () => {
  it('reads the start of a range CFI', () => {
    expect(cfiSortKey('epubcfi(/6/4[chap01]!/4/2,/1:10,/1:20)')).toEqual([6, 4, 4, 2, 1, 10])
  })

  it('orders by spine item, then by position within it', () => {
    const sorted = [
      'epubcfi(/6/8!/4/2/1:0)',
      'epubcfi(/6/4!/4/10/1:5)',
      'epubcfi(/6/4!/4/2,/1:30,/1:40)',
      'epubcfi(/6/4!/4/2/1:3)',
    ].sort(compareCfi)
    expect(sorted).toEqual([
      'epubcfi(/6/4!/4/2/1:3)',
      'epubcfi(/6/4!/4/2,/1:30,/1:40)',
      'epubcfi(/6/4!/4/10/1:5)',
      'epubcfi(/6/8!/4/2/1:0)',
    ])
  })

  it('ignores assertions, including escaped brackets and commas', () => {
    expect(cfiSortKey('epubcfi(/6/4[a^,b^]c]!/4[x]/2:7)')).toEqual([6, 4, 4, 2, 7])
  })

  it('compares numerically, not as text', () => {
    expect(compareCfi('epubcfi(/6/10!/4)', 'epubcfi(/6/9!/4)')).toBe(1)
  })
})
