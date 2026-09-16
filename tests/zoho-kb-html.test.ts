import assert from 'node:assert/strict'
import test from 'node:test'
import { containsStrongTag, removeStrongTags, sanitizeKnowledgeHtml } from '../lib/zoho/kbHtml'

test('removeStrongTags preserves content while removing strong elements', () => {
  assert.equal(
    removeStrongTags('<p>Un <STRONG class="x">texte</STRONG> libre</p>'),
    '<p>Un texte libre</p>',
  )
})

test('sanitizeKnowledgeHtml removes executable HTML and event handlers', () => {
  const sanitized = sanitizeKnowledgeHtml(
    '<p onclick="alert(1)">Texte</p><script>alert(2)</script><a href="javascript:alert(3)">Lien</a>',
  )
  assert.equal(sanitized, '<p>Texte</p><a href="#">Lien</a>')
})

test('containsStrongTag is case insensitive', () => {
  assert.equal(containsStrongTag('<Strong>Texte</Strong>'), true)
  assert.equal(containsStrongTag('<b>Texte</b>'), false)
})
