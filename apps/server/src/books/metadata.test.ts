import { describe, expect, it } from 'vitest'
import { htmlToText, matchKey, normaliseIsbn, sortTitle, titleFromFilename } from './metadata.ts'

describe('normaliseIsbn', () => {
  it('turns any valid spelling into ISBN-13', () => {
    expect(normaliseIsbn('urn:isbn:978-0-441-17271-9')).toBe('9780441172719')
    expect(normaliseIsbn('0-441-17271-7')).toBe('9780441172719')
    expect(normaliseIsbn('080442957X')).toBe('9780804429573')
  })

  it('rejects bad check digits and non-ISBNs', () => {
    expect(normaliseIsbn('9780441172710')).toBeUndefined()
    expect(normaliseIsbn('urn:uuid:1234')).toBeUndefined()
  })
})

describe('matching helpers', () => {
  it('folds case, diacritics and punctuation', () => {
    expect(matchKey('Les Misérables!', 'Victor  Hugo')).toBe(
      matchKey('les miserables', 'VICTOR HUGO'),
    )
  })

  it('drops leading articles for sorting', () => {
    expect(sortTitle('The Left Hand of Darkness')).toBe('Left Hand of Darkness')
  })

  it('derives a title from a filename', () => {
    expect(titleFromFilename('Frank_Herbert-Dune.pdf')).toBe('Frank Herbert-Dune')
  })

  it('turns HTML descriptions into plain text', () => {
    expect(htmlToText('<p>One &amp; two</p><p>Three&#8217;s</p>')).toBe('One & two\n\nThree’s')
  })
})
