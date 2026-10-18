import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { consume, createProduct, onHand, putAway } from './actions'
import { db } from './db'
import { findKnownProduct, makeDraft } from './lookup'

const HID = 'h1'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('store + actions (device-only mode)', () => {
  it('remembers a new barcode and adds instantly next time', async () => {
    const draft = makeDraft({ barcode: '041331124027', name: 'Black Beans' }, ['en:canned-black-beans'], 'off')
    const { product, remaining } = await createProduct(HID, draft, { location: 'pantry', count: 2, useBy: null })
    expect(remaining).toBe(2)

    const known = await findKnownProduct(HID, '041331124027')
    expect(known?.id).toBe(product.id)
    expect((await putAway(known!)).remaining).toBe(3)
    // Another household's memory is separate.
    expect(await findKnownProduct('other', '041331124027')).toBeUndefined()
  })

  it('undo restores exactly what changed', async () => {
    const draft = makeDraft({ barcode: '1', name: 'Black Beans' }, [], 'manual')
    const { product } = await createProduct(HID, draft, { location: 'pantry', count: 2, useBy: null })

    const used = await consume(product, { kind: 'one' })
    expect(used.remaining).toBe(1)
    await used.undo()
    expect(await onHand(product.id)).toBe(2)
  })

  it('undoing a brand-new product forgets it', async () => {
    const draft = makeDraft({ barcode: '999', name: 'Tahini' }, [], 'manual')
    const { undo } = await createProduct(HID, draft, { location: 'pantry', count: 1, useBy: null })
    await undo()
    expect(await findKnownProduct(HID, '999')).toBeUndefined()
  })

  it('does not queue sync work when no backend is configured', async () => {
    const draft = makeDraft({ barcode: '5', name: 'Rice' }, [], 'manual')
    await createProduct(HID, draft, { location: 'pantry', count: 1, useBy: null })
    expect(await db.outbox.count()).toBe(0)
  })
})
