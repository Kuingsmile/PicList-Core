import { describe, expect, it } from 'vitest'

import { eventBus } from '../../src/utils/eventBus'

describe('eventBus', () => {
  it('should be an EventEmitter instance', () => {
    expect(typeof eventBus.on).toBe('function')
    expect(typeof eventBus.emit).toBe('function')
    expect(typeof eventBus.removeAllListeners).toBe('function')
  })

  it('should support pub/sub', () => {
    const results: string[] = []
    const listener = (data: string) => results.push(data)

    eventBus.on('test-event', listener)
    eventBus.emit('test-event', 'hello')
    eventBus.emit('test-event', 'world')
    eventBus.removeListener('test-event', listener)

    expect(results).toEqual(['hello', 'world'])
  })

  it('should be a singleton', async () => {
    const { eventBus: sameBus } = await import('../../src/utils/eventBus')
    expect(sameBus).toBe(eventBus)
  })
})
